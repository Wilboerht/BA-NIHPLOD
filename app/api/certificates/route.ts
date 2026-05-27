import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { sql } from '@/lib/db';
import { requireAdmin } from '@/lib/auth';
import { COMPANY_FULL_NAME } from '@/lib/config';
import { sendPendingCertNotification } from '@/lib/mail';
import crypto from 'crypto';
import type { TransactionSql } from 'postgres';

/**
 * 证书管理 API - 已移除图片上传功能
 * 图片由前端用户实时生成，不进行持久化存储
 * 支持本地 PostgreSQL 直连或 Supabase
 */

// 辅助函数：生成唯一的证书编号
// 依赖数据库 cert_number UNIQUE 约束做最终保护，冲突时自动重试
function generateUniqueCertNumber(): string {
  const year = new Date().getFullYear();
  // 加入毫秒时间戳（36进制前3位）+ 随机串，极大降低并发冲突概率
  const timePart = Date.now().toString(36).substring(0, 3).toUpperCase();
  const randomPart = crypto.randomUUID().replace(/-/g, '').substring(0, 3).toUpperCase();
  return `BAVP-${year}-${timePart}${randomPart}`;
}

// 辅助函数：带重试的唯一证书编号生成
async function generateCertNumberWithRetry(tx: TransactionSql | typeof sql, maxRetries = 5): Promise<string> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const certNumber = generateUniqueCertNumber();
    const existing = await tx`SELECT id FROM certificates WHERE cert_number = ${certNumber} LIMIT 1`;
    if (!existing || existing.length === 0) {
      return certNumber;
    }
    // 证书编号冲突，继续重试
  }
  throw new Error(`无法生成唯一证书编号，已重试 ${maxRetries} 次`);
}

// 安全解析 duration 字符串 "YYYY.MM.DD - YYYY.MM.DD"
function parseDuration(duration: string | undefined): { start: string; end: string } {
  if (!duration || typeof duration !== 'string') {
    return { start: '', end: '' };
  }
  const parts = duration.split(' - ');
  if (parts.length !== 2) {
    throw new Error(`有效期格式无效："${duration}"，应为 "YYYY.MM.DD - YYYY.MM.DD"`);
  }
  const start = parts[0].replace(/\./g, '-').trim();
  const end = parts[1].replace(/\./g, '-').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) {
    throw new Error(`有效期格式无效："${duration}"，日期应为 YYYY.MM.DD 格式`);
  }
  if (new Date(start) > new Date(end)) {
    throw new Error('有效期无效：结束日期不能早于开始日期');
  }
  return { start, end };
}

// 保留原值存储；parseAuthScope 使用 firstSep/lastSep 策略，可安全处理 scopeText 内部包含 " | " 的情况
function sanitizeForAuthScope(input: string): string {
  return input || '';
}

// 辅助函数：查询或创建经销商（支持一个 phone 对应多个主体名称）
// 使用 ON CONFLICT 避免并发竞态
async function getOrCreateDealer(phone: string | undefined | null, shopName: string, tx: TransactionSql | typeof sql) {
  const safePhone = phone?.trim() || null;
  const result = await tx`
    INSERT INTO dealers (company_name, phone) 
    VALUES (${shopName}, ${safePhone}) 
    ON CONFLICT (phone, company_name) DO UPDATE SET company_name = EXCLUDED.company_name
    RETURNING id
  `;
  return result[0].id;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { action, certData, certId } = body;

    // 验证管理员权限（所有证书操作都需要管理员权限）
    const { user: adminUser, response } = await requireAdmin(req);
    if (response) {
      return response;
    }

    const managerId = adminUser!.id;

    // 字段长度校验
    if (certData) {
      if (certData.shopName && certData.shopName.length > 200) {
        return NextResponse.json({ error: '授权主体名称过长，最多 200 个字符' }, { status: 400 });
      }
      if (certData.phone && certData.phone.length > 20) {
        return NextResponse.json({ error: '手机号过长，最多 20 个字符' }, { status: 400 });
      }
      if (certData.scopeText && certData.scopeText.length > 1000) {
        return NextResponse.json({ error: '授权范围过长，最多 1000 个字符' }, { status: 400 });
      }
      if (certData.companyName && certData.companyName.length > 100) {
        return NextResponse.json({ error: '公司名称过长，最多 100 个字符' }, { status: 400 });
      }
      if (certData.authorizer && certData.authorizer.length > 200) {
        return NextResponse.json({ error: '授权方名称过长，最多 200 个字符' }, { status: 400 });
      }
    }

    // --- 流程 1: 审核员提报 (录入数据，状态为 PENDING) ---
    if (action === 'create_pending') {
      let certNumber: string;
      let dealerId: string;
      await sql.begin(async (tx) => {
        certNumber = await generateCertNumberWithRetry(tx);
        dealerId = await getOrCreateDealer(certData.phone, certData.shopName, tx);
        await tx`
          INSERT INTO certificates (cert_number, dealer_id, auth_scope, start_date, end_date, status, final_image_url, seal_url, auditor_id, manager_id)
          VALUES (
            ${certNumber},
            ${dealerId},
            ${sanitizeForAuthScope(certData.companyName) + ' | ' + sanitizeForAuthScope(certData.scopeText) + ' | ' + (certData.authorizer || COMPANY_FULL_NAME)},
            ${parseDuration(certData.duration).start},
            ${parseDuration(certData.duration).end},
            'PENDING',
            null,
            ${certData.sealImage || null},
            ${managerId},
            null
          )
        `;
      });

      // 异步通知管理员（不阻塞响应）
      (async () => {
        try {
          const admins = await sql`SELECT COALESCE(email, username) as email, full_name FROM profiles WHERE role = 'SUPER_ADMIN' AND deleted_at IS NULL AND (email IS NOT NULL OR username IS NOT NULL)`;
          if (admins.length > 0) {
            const auditorResult = await sql`SELECT full_name FROM profiles WHERE id = ${managerId} AND deleted_at IS NULL LIMIT 1`;
            const auditorName = ((auditorResult[0] as unknown) as { full_name?: string })?.full_name || '审核员';
            const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://ba.nihplod.cn';
            sendPendingCertNotification({
              adminEmails: ((admins as unknown) as { email: string }[]).map(a => a.email),
              shopName: certData.shopName || '未知店铺',
              certNumber: certNumber!,
              auditorName,
              duration: certData.duration || '',
              baseUrl,
            });
          }
        } catch {
          // 邮件通知失败不影响主流程
        }
      })();

      return NextResponse.json({ success: true, status: 'PENDING' });
    }

    // --- 流程 2: 项目负责人审核通过并核发 (创建账户 + 状态转为 ISSUED) ---
    if (action === 'approve_issue') {
      let certDataDb, dealerPhone, dealerShopName;
      let certNumber = '';

      if (certId) {
        // A. 系统流程：处理已有的待审核记录
        const result = await sql`
          SELECT c.*, d.phone, d.company_name FROM certificates c
          LEFT JOIN dealers d ON c.dealer_id = d.id
          WHERE c.id = ${certId} LIMIT 1
        `;
        if (!result || result.length === 0) throw new Error(`未找到待审核证书 (ID: ${certId})`);
        certDataDb = result[0];
        dealerPhone = certDataDb.phone;
        dealerShopName = certDataDb.company_name;
        certNumber = certDataDb.cert_number;
      } else if (certData) {
        // B. 管理员直发
        dealerPhone = certData.phone;
        dealerShopName = certData.shopName;

        await sql.begin(async (tx) => {
          certNumber = await generateCertNumberWithRetry(tx);
          const dealerId = await getOrCreateDealer(certData.phone, certData.shopName, tx);
          await tx`
            INSERT INTO certificates (cert_number, dealer_id, auth_scope, start_date, end_date, status, final_image_url, seal_url, manager_id)
            VALUES (
              ${certNumber},
              ${dealerId},
              ${sanitizeForAuthScope(certData.companyName) + ' | ' + sanitizeForAuthScope(certData.scopeText) + ' | ' + (certData.authorizer || COMPANY_FULL_NAME)},
              ${parseDuration(certData.duration).start},
              ${parseDuration(certData.duration).end},
              'ISSUED',
              null,
              ${certData.sealImage || null},
              ${managerId}
            )
          `;
        });
      } else {
        throw new Error('缺少核发数据');
      }

      // 如果是从待审核转为 ISSUED，更新状态
      if (certId) {
        const updateResult = await sql`UPDATE certificates SET status = 'ISSUED', manager_id = ${managerId} WHERE id = ${certId} AND status = 'PENDING' RETURNING id`;
        if (!updateResult || updateResult.length === 0) {
          throw new Error('该证书不是待审核状态，无法核发');
        }
      }

      // 记录审计日志
      await sql`
        INSERT INTO audit_logs (certificate_id, actor_id, action, comment, created_at)
        VALUES (
          ${certId || null},
          ${managerId},
          'ISSUE_CERTIFICATE',
          ${`核发证书 ${certNumber}，经销商：${dealerPhone || '未填写电话'}`},
          NOW()
        )
      `;

      return NextResponse.json({ success: true, status: 'ISSUED', phone: dealerPhone });
    }

    // --- 流程 3: 吊销证书 (管理员行为) ---
    if (action === 'revoke_certificate') {
      if (!certId) throw new Error('缺少证书 ID');
      const result = await sql`SELECT id, status, cert_number FROM certificates WHERE id = ${certId} LIMIT 1`;
      if (!result || result.length === 0) throw new Error('未找到对应证书');
      if (result[0].status === 'REVOKED') {
        return NextResponse.json({ success: true, status: 'REVOKED', message: '证书已是吊销状态' });
      }
      if (result[0].status !== 'ISSUED') {
        return NextResponse.json({ error: '只能吊销已核发的证书' }, { status: 400 });
      }
      await sql`UPDATE certificates SET status = 'REVOKED' WHERE id = ${certId}`;
      // 记录审计日志
      await sql`
        INSERT INTO audit_logs (certificate_id, actor_id, action, comment, created_at)
        VALUES (
          ${certId},
          ${managerId},
          'REVOKE_CERTIFICATE',
          ${`吊销证书 ${result[0].cert_number}`},
          NOW()
        )
      `;
      return NextResponse.json({ success: true, status: 'REVOKED' });
    }

    // --- 流程 4: 退回/拒绝 审核员提交的申请 ---
    if (action === 'reject_pending') {
      if (!certId) throw new Error('缺少证书 ID');

      const certInfo = await sql`SELECT cert_number FROM certificates WHERE id = ${certId} LIMIT 1`;
      const updateResult = await sql`UPDATE certificates SET status = 'REJECTED', manager_id = ${managerId} WHERE id = ${certId} AND status = 'PENDING' RETURNING id`;
      // postgres 库返回更新后的行数组，若为空表示没有匹配到 PENDING 状态的记录
      if (!updateResult || updateResult.length === 0) {
        return NextResponse.json({ error: '该证书不是待审核状态，无法拒绝' }, { status: 400 });
      }
      // 记录审计日志
      await sql`
        INSERT INTO audit_logs (certificate_id, actor_id, action, comment, created_at)
        VALUES (
          ${certId},
          ${managerId},
          'REJECT_CERTIFICATE',
          ${`退回证书申请 ${certInfo[0]?.cert_number || ''}`},
          NOW()
        )
      `;
      return NextResponse.json({ success: true, status: 'REJECTED' });
    }

    // --- 流程 6: 彻底删除无效证书 (仅 SUPER_ADMIN，不留记录) ---
    if (action === 'delete_certificate') {
      if (!certId) throw new Error('缺少证书 ID');

      // 仅 SUPER_ADMIN 可删除
      if (adminUser!.role !== 'SUPER_ADMIN') {
        return NextResponse.json({ error: '无权限执行此操作，仅超级管理员可彻底删除证书记录' }, { status: 403 });
      }

      // 只能删除无效状态的证书；RETURNING 用于确认确实删到了记录
      const result = await sql`
        DELETE FROM certificates
        WHERE id = ${certId}
          AND status IN ('EXPIRED', 'REVOKED', 'REJECTED')
        RETURNING cert_number
      `;

      if (!result || result.length === 0) {
        return NextResponse.json({ error: '删除失败：只能彻底删除已失效、已吊销或已拒绝的证书，且记录必须存在' }, { status: 400 });
      }

      return NextResponse.json({ success: true, message: `证书 ${result[0].cert_number} 已彻底删除` });
    }

    // --- 流程 5: 更新证书信息 (管理员修正笔误等) ---
    if (action === 'update_certificate') {
      if (!certId) throw new Error('缺少证书 ID');
      if (!certData) throw new Error('缺少更新数据');

      // 状态机校验：已吊销的证书不允许编辑
      const statusCheck = await sql`SELECT status FROM certificates WHERE id = ${certId} LIMIT 1`;
      if (statusCheck[0]?.status === 'REVOKED') {
        return NextResponse.json({ error: '已吊销的证书不可编辑' }, { status: 400 });
      }

      const result = await sql`SELECT dealer_id, cert_number FROM certificates WHERE id = ${certId} LIMIT 1`;
      if (!result || result.length === 0) throw new Error('未找到对应证书记录');
      const dealerId = result[0].dealer_id;
      const certNumber = result[0].cert_number;

      // 更新经销商资料和证书在同一事务中
      await sql.begin(async (tx) => {
        await tx`UPDATE dealers SET company_name = ${certData.shopName}, phone = ${certData.phone?.trim() || null} WHERE id = ${dealerId}`;
        await tx`
          UPDATE certificates
          SET auth_scope = ${sanitizeForAuthScope(certData.companyName) + ' | ' + sanitizeForAuthScope(certData.scopeText) + ' | ' + (certData.authorizer || COMPANY_FULL_NAME)},
              start_date = ${parseDuration(certData.duration).start},
              end_date = ${parseDuration(certData.duration).end},
              seal_url = ${certData.sealImage || null},
              manager_id = ${managerId}
          WHERE id = ${certId}
        `;
      });

      // 记录审计日志
      await sql`
        INSERT INTO audit_logs (certificate_id, actor_id, action, comment, created_at)
        VALUES (
          ${certId},
          ${managerId},
          'UPDATE_CERTIFICATE',
          ${`更新证书信息 ${certNumber}`},
          NOW()
        )
      `;

      return NextResponse.json({ success: true, status: 'UPDATED' });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (err: unknown) {
    console.error('[certificates]', err);
    const errorMessage = err instanceof Error ? err.message : String(err);
    const isDev = process.env.NODE_ENV !== 'production';
    return NextResponse.json(
      { error: '操作失败', detail: isDev ? errorMessage : undefined },
      { status: 500 }
    );
  }
}

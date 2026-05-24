import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { sql } from '@/lib/db';
import { requireAdmin } from '@/lib/auth';
import { COMPANY_FULL_NAME } from '@/lib/config';
import crypto from 'crypto';
import type { TransactionSql } from 'postgres';

/**
 * 证书管理 API - 已移除图片上传功能
 * 图片由前端用户实时生成，不进行持久化存储
 * 支持本地 PostgreSQL 直连或 Supabase
 */

// 辅助函数：生成唯一的证书编号
// 依赖数据库 cert_number UNIQUE 约束做最终保护，冲突时外层事务会回滚并重试
function generateUniqueCertNumber(): string {
  const year = new Date().getFullYear();
  const base = `BAVP-${year}-`;
  const randomPart = crypto.randomUUID().replace(/-/g, '').substring(0, 4).toUpperCase();
  return `${base}${randomPart}`;
}

// 安全解析 duration 字符串 "YYYY.MM.DD - YYYY.MM.DD"
function parseDuration(duration: string | undefined): { start: string; end: string } {
  if (!duration || typeof duration !== 'string') {
    return { start: '', end: '' };
  }
  const parts = duration.split(' - ');
  return {
    start: (parts[0] || '').replace(/\./g, '-').trim(),
    end: (parts[1] || '').replace(/\./g, '-').trim(),
  };
}

// 辅助函数：查询或创建经销商（支持一个 phone 对应多个主体名称）
// 使用 ON CONFLICT 避免并发竞态
async function getOrCreateDealer(phone: string, shopName: string, tx: TransactionSql | typeof sql) {
  const result = await tx`
    INSERT INTO dealers (company_name, phone) 
    VALUES (${shopName}, ${phone}) 
    ON CONFLICT (phone, company_name) DO UPDATE SET company_name = EXCLUDED.company_name
    RETURNING id
  `;
  return result[0].id;
}

// 辅助函数：获取或创建经销商账户
// 返回 { id, tempPassword }
async function getOrCreateDealerProfile(phone: string, shopName: string, tx: TransactionSql | typeof sql): Promise<{ id: string; tempPassword: string | null }> {
  // 先查询已有账户（在事务内保持一致性）
  const existing = await tx`SELECT id, role FROM profiles WHERE username = ${phone} LIMIT 1`;
  if (existing.length > 0) {
    if (existing[0].role !== 'DEALER') {
      throw new Error(`该手机号已绑定非经销商账户（角色: ${existing[0].role}），无法为其创建/重置经销商账户`);
    }
    return { id: existing[0].id, tempPassword: null };
  }

  // 创建新账户，ON CONFLICT DO NOTHING 防止并发重复插入
  const tempPassword = crypto.randomBytes(8).toString('hex');
  const passwordHash = await bcrypt.hash(tempPassword, 12);
  const profileId = crypto.randomUUID();

  await tx`
    INSERT INTO profiles (id, username, full_name, phone, password_hash, role, is_first_login)
    VALUES (${profileId}, ${phone}, ${shopName}, ${phone}, ${passwordHash}, 'DEALER', true)
    ON CONFLICT (username) DO NOTHING
  `;

  // 重新查询获取实际 ID（可能由并发请求插入）
  const created = await tx`SELECT id FROM profiles WHERE username = ${phone} LIMIT 1`;
  if (!created || created.length === 0) {
    throw new Error('经销商账户创建失败');
  }
  return { id: created[0].id, tempPassword };
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
      const certNumber = generateUniqueCertNumber();
      await sql.begin(async (tx) => {
        const dealerId = await getOrCreateDealer(certData.phone, certData.shopName, tx);
        await tx`
          INSERT INTO certificates (cert_number, dealer_id, auth_scope, start_date, end_date, status, final_image_url, seal_url, auditor_id, manager_id)
          VALUES (
            ${certNumber},
            ${dealerId},
            ${certData.companyName + ' | ' + certData.scopeText + ' | ' + (certData.authorizer || COMPANY_FULL_NAME)},
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
      return NextResponse.json({ success: true, status: 'PENDING' });
    }

    // --- 流程 2: 项目负责人审核通过并核发 (创建账户 + 状态转为 ISSUED) ---
    if (action === 'approve_issue') {
      let certDataDb, dealerPhone, dealerShopName;
      let certNumber: string;

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
        certNumber = generateUniqueCertNumber();
        dealerPhone = certData.phone;
        dealerShopName = certData.shopName;

        await sql.begin(async (tx) => {
          const dealerId = await getOrCreateDealer(certData.phone, certData.shopName, tx);
          await tx`
            INSERT INTO certificates (cert_number, dealer_id, auth_scope, start_date, end_date, status, final_image_url, seal_url, manager_id)
            VALUES (
              ${certNumber},
              ${dealerId},
              ${certData.companyName + ' | ' + certData.scopeText + ' | ' + (certData.authorizer || COMPANY_FULL_NAME)},
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

      // 创建或获取经销商账户（已有账户不会重置密码）——与证书操作分离，失败不影响已核发证书
      const { tempPassword } = await getOrCreateDealerProfile(dealerPhone, dealerShopName, sql);

      // 如果是从待审核转为 ISSUED，更新状态
      if (certId) {
        const updateResult = await sql`UPDATE certificates SET status = 'ISSUED', manager_id = ${managerId} WHERE id = ${certId} AND status = 'PENDING' RETURNING id`;
        if (!updateResult || updateResult.length === 0) {
          throw new Error('该证书不是待审核状态，无法核发');
        }
      }

      const responseData: Record<string, unknown> = { success: true, status: 'ISSUED', phone: dealerPhone };
      if (tempPassword) {
        responseData.tempPassword = tempPassword;
        responseData.note = '该经销商账户为新创建，请通过安全渠道告知对方临时密码';
      }
      return NextResponse.json(responseData);
    }

    // --- 流程 3: 吊销证书 (管理员行为) ---
    if (action === 'revoke_certificate') {
      if (!certId) throw new Error('缺少证书 ID');
      const result = await sql`SELECT id, status FROM certificates WHERE id = ${certId} LIMIT 1`;
      if (!result || result.length === 0) throw new Error('未找到对应证书');
      if (result[0].status === 'REVOKED') {
        return NextResponse.json({ success: true, status: 'REVOKED', message: '证书已是吊销状态' });
      }
      if (result[0].status !== 'ISSUED') {
        return NextResponse.json({ error: '只能吊销已核发的证书' }, { status: 400 });
      }
      await sql`UPDATE certificates SET status = 'REVOKED' WHERE id = ${certId}`;
      return NextResponse.json({ success: true, status: 'REVOKED' });
    }

    // --- 流程 4: 退回/拒绝 审核员提交的申请 ---
    if (action === 'reject_pending') {
      if (!certId) throw new Error('缺少证书 ID');

      const updateResult = await sql`UPDATE certificates SET status = 'REJECTED', manager_id = ${managerId} WHERE id = ${certId} AND status = 'PENDING'`;
      // postgres 库返回更新后的行数组，若为空表示没有匹配到 PENDING 状态的记录
      if (!updateResult || updateResult.length === 0) {
        return NextResponse.json({ error: '该证书不是待审核状态，无法拒绝' }, { status: 400 });
      }
      return NextResponse.json({ success: true, status: 'REJECTED' });
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

      const result = await sql`SELECT dealer_id FROM certificates WHERE id = ${certId} LIMIT 1`;
      if (!result || result.length === 0) throw new Error('未找到对应证书记录');
      const dealerId = result[0].dealer_id;

      // 更新经销商资料和证书在同一事务中
      await sql.begin(async (tx) => {
        await tx`UPDATE dealers SET company_name = ${certData.shopName}, phone = ${certData.phone} WHERE id = ${dealerId}`;
        await tx`
          UPDATE certificates
          SET auth_scope = ${certData.companyName + ' | ' + certData.scopeText + ' | ' + (certData.authorizer || COMPANY_FULL_NAME)},
              start_date = ${parseDuration(certData.duration).start},
              end_date = ${parseDuration(certData.duration).end},
              seal_url = ${certData.sealImage || null},
              manager_id = ${managerId}
          WHERE id = ${certId}
        `;
      });
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

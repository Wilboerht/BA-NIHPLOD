import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { sql } from '@/lib/db';
import { requireAdmin } from '@/lib/auth';

/**
 * 证书管理 API - 已移除图片上传功能
 * 图片由前端用户实时生成，不进行持久化存储
 * 支持本地 PostgreSQL 直连或 Supabase
 */

// 辅助函数：生成唯一的证书编号
async function generateUniqueCertNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const base = `BAVP-${year}-`;
  
  for (let attempt = 0; attempt < 10; attempt++) {
    // 使用 36 进制生成 4 位随机字符（167万组合），远大于原来的 9000
    const randomPart = Math.random().toString(36).substring(2, 6).toUpperCase();
    const certNumber = `${base}${randomPart}`;
    
    // 检查是否已存在
    const existing = await sql`SELECT 1 FROM certificates WHERE cert_number = ${certNumber} LIMIT 1`;
    if (existing.length === 0) return certNumber;
  }
  
  // 如果 10 次都碰撞（概率极低），使用时间戳确保唯一
  return `${base}${Date.now().toString(36).substring(2, 6).toUpperCase()}`;
}

// 辅助函数：查询或创建经销商（支持一个 phone 对应多个主体名称）
async function getOrCreateDealer(phone: string, shopName: string) {
  // 先检查是否已有 (phone, company_name) 的组合记录
  const existing = await sql`
    SELECT id FROM dealers 
    WHERE phone = ${phone} AND company_name = ${shopName} 
    LIMIT 1
  `;
  if (existing.length > 0) {
    return existing[0].id;
  }
  // 创建新的主体记录
  const result = await sql`
    INSERT INTO dealers (company_name, phone) 
    VALUES (${shopName}, ${phone}) 
    RETURNING id
  `;
  return result[0].id;
}

// 辅助函数：获取或创建经销商账户
async function getOrCreateDealerProfile(phone: string, shopName: string) {
  const passwordHash = await bcrypt.hash(phone, 10);

  // 检查是否已有此账户
  const existing = await sql`SELECT id, is_first_login FROM profiles WHERE username = ${phone} LIMIT 1`;
  if (existing.length > 0) {
    // 更新密码
    await sql`UPDATE profiles SET password_hash = ${passwordHash} WHERE id = ${existing[0].id}`;
    return existing[0].id;
  }
  // 创建新账户
  const profileId = crypto.randomUUID();
  await sql`
    INSERT INTO profiles (id, username, full_name, phone, password_hash, role, is_first_login)
    VALUES (${profileId}, ${phone}, ${shopName}, ${phone}, ${passwordHash}, 'DEALER', true)
  `;
  return profileId;
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

    // --- 流程 1: 审核员提报 (录入数据，状态为 PENDING) ---
    if (action === 'create_pending') {
      const dealerId = await getOrCreateDealer(certData.phone, certData.shopName);
      const certNumber = await generateUniqueCertNumber();

      await sql`
        INSERT INTO certificates (cert_number, dealer_id, auth_scope, start_date, end_date, status, final_image_url, auditor_id, manager_id)
        VALUES (
          ${certNumber},
          ${dealerId},
          ${certData.platformId + ' | ' + certData.scopeText + ' | ' + (certData.authorizer || '旎柏（上海）商贸有限公司')},
          ${certData.duration.split(' - ')[0].replace(/\./g, '-')},
          ${certData.duration.split(' - ')[1].replace(/\./g, '-')},
          'PENDING',
          null,
          ${managerId},
          null
        )
      `;
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
        const dealerId = await getOrCreateDealer(certData.phone, certData.shopName);
        certNumber = await generateUniqueCertNumber();
        dealerPhone = certData.phone;
        dealerShopName = certData.shopName;

        await sql`
          INSERT INTO certificates (cert_number, dealer_id, auth_scope, start_date, end_date, status, final_image_url, seal_url, manager_id)
          VALUES (
            ${certNumber},
            ${dealerId},
            ${certData.platformId + ' | ' + certData.scopeText + ' | ' + (certData.authorizer || '旎柏（上海）商贸有限公司')},
            ${certData.duration.split(' - ')[0].replace(/\./g, '-')},
            ${certData.duration.split(' - ')[1].replace(/\./g, '-')},
            'ISSUED',
            null,
            null,
            ${managerId}
          )
        `;
      } else {
        throw new Error('缺少核发数据');
      }

      // 创建或更新经销商账户
      await getOrCreateDealerProfile(dealerPhone, dealerShopName);

      // 如果是从待审核转为 ISSUED，更新状态
      if (certId) {
        await sql`UPDATE certificates SET status = 'ISSUED', manager_id = ${managerId} WHERE id = ${certId}`;
      }

      return NextResponse.json({ success: true, status: 'ISSUED', phone: dealerPhone, password: dealerPhone });
    }

    // --- 流程 3: 吊销证书 (管理员行为) ---
    if (action === 'revoke_certificate') {
      const result = await sql`SELECT id, status FROM certificates WHERE id = ${certId} LIMIT 1`;
      if (!result || result.length === 0) throw new Error('未找到对应证书');
      if (result[0].status === 'REVOKED') {
        return NextResponse.json({ success: true, status: 'REVOKED', message: '证书已是吊销状态' });
      }
      await sql`UPDATE certificates SET status = 'REVOKED' WHERE id = ${certId}`;
      return NextResponse.json({ success: true, status: 'REVOKED' });
    }

    // --- 流程 4: 退回/拒绝 审核员提交的申请 ---
    if (action === 'reject_pending') {
      if (!certId) throw new Error('缺少证书 ID');

      await sql`UPDATE certificates SET status = 'REJECTED', manager_id = ${managerId} WHERE id = ${certId} AND status = 'PENDING'`;
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

      // 更新经销商资料
      await sql`UPDATE dealers SET company_name = ${certData.shopName}, phone = ${certData.phone} WHERE id = ${dealerId}`;

      // 更新证书
      await sql`
        UPDATE certificates
        SET auth_scope = ${certData.platformId + ' | ' + certData.scopeText + ' | ' + (certData.authorizer || '旎柏（上海）商贸有限公司')},
            start_date = ${certData.duration.split(' - ')[0].replace(/\./g, '-')},
            end_date = ${certData.duration.split(' - ')[1].replace(/\./g, '-')},
            manager_id = ${managerId}
        WHERE id = ${certId}
      `;
      return NextResponse.json({ success: true, status: 'UPDATED' });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (err: unknown) {
    console.error(err);
    return NextResponse.json({ error: '操作失败' }, { status: 500 });
  }
}

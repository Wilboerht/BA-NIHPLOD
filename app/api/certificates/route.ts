import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { USE_LOCAL_DB, sql } from '@/lib/db';
import { supabaseAdmin } from '@/lib/supabase-admin';

/**
 * 证书管理 API - 已移除图片上传功能
 * 图片由前端用户实时生成，不进行持久化存储
 * 支持本地 PostgreSQL 直连或 Supabase
 */

// 辅助函数：检查管理员权限
async function checkManager(managerId: string) {
  if (USE_LOCAL_DB && sql) {
    const result = await sql`SELECT id, username, role FROM profiles WHERE id = ${managerId} LIMIT 1`;
    return result.length > 0;
  } else {
    const { data } = await supabaseAdmin.from('profiles').select('id, username, role').eq('id', managerId).maybeSingle();
    return !!data;
  }
}

// 辅助函数：查询或创建经销商（支持一个 phone 对应多个主体名称）
async function getOrCreateDealer(phone: string, shopName: string) {
  if (USE_LOCAL_DB && sql) {
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
  } else {
    // 先检查是否已有 (phone, company_name) 的组合
    const { data: existingDealer } = await supabaseAdmin
      .from('dealers')
      .select('id')
      .eq('phone', phone)
      .eq('company_name', shopName)
      .maybeSingle();
    
    if (existingDealer) {
      return existingDealer.id;
    }
    // 创建新的主体记录
    const { data: newDealer, error: newDealerErr } = await supabaseAdmin
      .from('dealers')
      .insert({ company_name: shopName, phone })
      .select('id')
      .single();
    if (newDealerErr || !newDealer) {
      throw new Error(`经销商主体创建失败: ${newDealerErr?.message || '未知错误'}`);
    }
    return newDealer.id;
  }
}

// 辅助函数：获取或创建经销商账户
async function getOrCreateDealerProfile(phone: string, shopName: string, managerId: string) {
  const passwordHash = await bcrypt.hash(phone, 10);

  if (USE_LOCAL_DB && sql) {
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
  } else {
    const { data: existingProfile } = await supabaseAdmin.from('profiles').select('id, is_first_login').eq('username', phone).maybeSingle();
    if (existingProfile) {
      await supabaseAdmin.from('profiles').update({ password_hash: passwordHash }).eq('id', existingProfile.id);
      return existingProfile.id;
    }
    const { data: newProfile, error: newProfileErr } = await supabaseAdmin
      .from('profiles')
      .insert({
        id: crypto.randomUUID(),
        username: phone,
        full_name: shopName,
        phone: phone,
        password_hash: passwordHash,
        role: 'DEALER',
        is_first_login: true
      })
      .select('id')
      .single();
    if (newProfileErr || !newProfile) {
      throw new Error(`经销商账户创建失败: ${newProfileErr?.message || '未知错误'}`);
    }
    return newProfile.id;
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { action, certData, managerId, certId } = body;

    // ✅ 验证 managerId
    if (managerId) {
      const managerExists = await checkManager(managerId);
      if (!managerExists) {
        console.error(`❌ Manager ID 在数据库中不存在: ${managerId}`);
        return NextResponse.json(
          { error: `❌ 身份验证失效：您的登录信息已过期（账户不存在于数据库中）。\n\n请清除浏览器缓存重新登录：\n1. F12 打开开发工具\n2. 应用程序(Application) → 存储(Storage) → 会话存储(SessionStorage)\n3. 清除所有内容\n4. 重新刷新页面并登录。` },
          { status: 403 }
        );
      }
    }

    // --- 流程 1: 审核员提报 (录入数据，状态为 PENDING) ---
    if (action === 'create_pending') {
      const dealerId = await getOrCreateDealer(certData.phone, certData.shopName);
      const certNumber = `BAVP-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;

      if (USE_LOCAL_DB && sql) {
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
      } else {
        await supabaseAdmin.from('certificates').insert({
          cert_number: certNumber,
          dealer_id: dealerId,
          auth_scope: certData.platformId + ' | ' + certData.scopeText + ' | ' + (certData.authorizer || '旎柏（上海）商贸有限公司'),
          start_date: certData.duration.split(' - ')[0].replace(/\./g, '-'),
          end_date: certData.duration.split(' - ')[1].replace(/\./g, '-'),
          status: 'PENDING',
          final_image_url: null,
          auditor_id: managerId,
          manager_id: null
        });
      }
      return NextResponse.json({ success: true, status: 'PENDING' });
    }

    // --- 流程 2: 项目负责人审核通过并核发 (创建账户 + 状态转为 ISSUED) ---
    if (action === 'approve_issue') {
      let certDataDb, dealerPhone, dealerShopName;
      let certNumber: string;

      if (certId) {
        // A. 系统流程：处理已有的待审核记录
        if (USE_LOCAL_DB && sql) {
          const result = await sql`
            SELECT c.*, d.phone, d.company_name FROM certificates c
            LEFT JOIN dealers d ON c.dealer_id = d.id
            WHERE c.id = ${certId} LIMIT 1
          `;
          if (!result || result.length === 0) throw new Error(`未找到待审核证书 (ID: ${certId})`);
          certDataDb = result[0];
          dealerPhone = certDataDb.phone;
          dealerShopName = certDataDb.company_name;
        } else {
          const { data: dbData, error: getCertErr } = await supabaseAdmin
            .from('certificates')
            .select('*, dealers(*)')
            .eq('id', certId)
            .single();
          if (getCertErr || !dbData) throw new Error(`未找到待审核证书 (ID: ${certId})`);
          certDataDb = dbData;
          dealerPhone = dbData.dealers.phone;
          dealerShopName = dbData.dealers.company_name;
        }
        certNumber = certDataDb.cert_number;
      } else if (certData) {
        // B. 管理员直发
        const dealerId = await getOrCreateDealer(certData.phone, certData.shopName);
        certNumber = `BAVP-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;
        dealerPhone = certData.phone;
        dealerShopName = certData.shopName;

        if (USE_LOCAL_DB && sql) {
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
          await supabaseAdmin.from('certificates').insert({
            cert_number: certNumber,
            dealer_id: dealerId,
            auth_scope: certData.platformId + ' | ' + certData.scopeText + ' | ' + (certData.authorizer || '旎柏（上海）商贸有限公司'),
            start_date: certData.duration.split(' - ')[0].replace(/\./g, '-'),
            end_date: certData.duration.split(' - ')[1].replace(/\./g, '-'),
            status: 'ISSUED',
            final_image_url: null,
            seal_url: null,
            manager_id: managerId
          });
        }
      } else {
        throw new Error('缺少核发数据');
      }

      // 创建或更新经销商账户
      await getOrCreateDealerProfile(dealerPhone, dealerShopName, managerId);

      // 如果是从待审核转为 ISSUED，更新状态
      if (certId) {
        if (USE_LOCAL_DB && sql) {
          await sql`UPDATE certificates SET status = 'ISSUED', manager_id = ${managerId} WHERE id = ${certId}`;
        } else {
          await supabaseAdmin.from('certificates').update({ status: 'ISSUED', manager_id: managerId }).eq('id', certId);
        }
      }

      return NextResponse.json({ success: true, status: 'ISSUED', phone: dealerPhone, password: dealerPhone });
    }

    // --- 流程 3: 吊销证书 (管理员行为) ---
    if (action === 'revoke_certificate') {
      if (USE_LOCAL_DB && sql) {
        const result = await sql`SELECT id FROM certificates WHERE id = ${certId} LIMIT 1`;
        if (!result || result.length === 0) throw new Error('未找到对应证书');
        await sql`UPDATE certificates SET status = 'REVOKED' WHERE id = ${certId}`;
      } else {
        const { data: cert, error: certErr } = await supabaseAdmin
          .from('certificates')
          .select('*, dealers(*)')
          .eq('id', certId)
          .single();
        if (certErr || !cert) throw new Error('未找到对应证书');
        await supabaseAdmin.from('certificates').update({ status: 'REVOKED' }).eq('id', certId);
      }
      return NextResponse.json({ success: true, status: 'REVOKED' });
    }

    // --- 流程 4: 退回/拒绝 审核员提交的申请 ---
    if (action === 'reject_pending') {
      if (!certId) throw new Error('缺少证书 ID');

      if (USE_LOCAL_DB && sql) {
        await sql`UPDATE certificates SET status = 'REJECTED', manager_id = ${managerId} WHERE id = ${certId} AND status = 'PENDING'`;
      } else {
        await supabaseAdmin
          .from('certificates')
          .update({ status: 'REJECTED', manager_id: managerId })
          .eq('id', certId)
          .eq('status', 'PENDING');
      }
      return NextResponse.json({ success: true, status: 'REJECTED' });
    }

    // --- 流程 5: 更新证书信息 (管理员修正笔误等) ---
    if (action === 'update_certificate') {
      if (!certId) throw new Error('缺少证书 ID');
      if (!certData) throw new Error('缺少更新数据');

      if (USE_LOCAL_DB && sql) {
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
      } else {
        const { data: oldCert, error: oldErr } = await supabaseAdmin.from('certificates').select('*').eq('id', certId).single();
        if (oldErr || !oldCert) throw new Error('未找到对应证书记录');

        await supabaseAdmin
          .from('dealers')
          .update({ company_name: certData.shopName, phone: certData.phone })
          .eq('id', oldCert.dealer_id);

        await supabaseAdmin.from('certificates').update({
          auth_scope: certData.platformId + ' | ' + certData.scopeText + ' | ' + (certData.authorizer || '旎柏（上海）商贸有限公司'),
          start_date: certData.duration.split(' - ')[0].replace(/\./g, '-'),
          end_date: certData.duration.split(' - ')[1].replace(/\./g, '-'),
          manager_id: managerId
        }).eq('id', certId);
      }
      return NextResponse.json({ success: true, status: 'UPDATED' });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

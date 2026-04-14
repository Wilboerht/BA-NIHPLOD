import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';

/**
 * 证书管理 API - 已移除图片上传功能
 * 图片由前端用户实时生成，不进行持久化存储
 */

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { action, certData, managerId, certId } = body;

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseServiceRole = process.env.SUPABASE_SERVICE_ROLE_KEY!;

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRole, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });

    // ✅ 验证 managerId
    if (managerId) {
      const { data: managerExists, error: managerCheckErr } = await supabaseAdmin
        .from('profiles')
        .select('id, username, role')
        .eq('id', managerId)
        .maybeSingle();

      if (managerCheckErr || !managerExists) {
        console.error(`❌ Manager ID 在数据库中不存在或出错: ${managerId}`);
        return NextResponse.json(
          { error: `❌ 身份验证失效：您的登录信息已过期（账户不存在于数据库中）。\n\n请清除浏览器缓存重新登录：\n1. F12 打开开发工具\n2. 应用程序(Application) → 存储(Storage) → 会话存储(SessionStorage)\n3. 清除所有内容\n4. 重新刷新页面并登录。` },
          { status: 403 }
        );
      }
    }

    // --- 流程 1: 审核员提报 (录入数据，状态为 PENDING) ---
    if (action === 'create_pending') {
      // 创建或获取经销商 (通过 phone 去重)
      const { data: existingDealer } = await supabaseAdmin
          .from('dealers')
          .select('id')
          .eq('phone', certData.phone)
          .maybeSingle();

      let dealerId;
      if (existingDealer) {
          dealerId = existingDealer.id;
          // 保留原有的公司名，不要覆盖
      } else {
          const { data: newDealer, error: insErr } = await supabaseAdmin
              .from('dealers')
              .insert({ 
                  company_name: certData.shopName,
                  phone: certData.phone 
              })
              .select('id')
              .single();
          
          if (insErr || !newDealer) throw new Error(`经销商（${certData.shopName}）基础档案录入失败: ${insErr?.message}`);
          dealerId = newDealer.id;
      }

      const certNumber = `BAVP-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;

        const { data: cert, error: certErr } = await supabaseAdmin.from('certificates').insert({
          cert_number: certNumber,
          dealer_id: dealerId,
          auth_scope: certData.platformId + ' | ' + certData.scopeText + ' | ' + (certData.authorizer || "旎柏（上海）商贸有限公司"),
          start_date: certData.duration.split(' - ')[0].replace(/\./g, '-'),
          end_date: certData.duration.split(' - ')[1].replace(/\./g, '-'),
          status: 'PENDING', // 待审核
          final_image_url: null, // 不保存图片
          auditor_id: managerId, // 提报人作为初审人
          manager_id: null
        }).select().single();

        if (certErr) throw certErr;
        return NextResponse.json({ success: true, status: 'PENDING' });
    }

    // --- 流程 2: 项目负责人审核通过并核发 (创建账户 + 状态转为 ISSUED) ---
    if (action === 'approve_issue') {
      let certDataDb;
      let certNumber: string;
      
      if (certId) {
        // A. 系统流程：处理已有的待审核记录 (通过 ID)
        const { data: dbData, error: getCertErr } = await supabaseAdmin
          .from('certificates')
          .select('*, dealers(*)')
          .eq('id', certId)
          .single();
        if (getCertErr || !dbData) throw new Error("未找到待审核证书 (ID: " + certId + ")");
        certDataDb = dbData;
        certNumber = dbData.cert_number;
      } else if (certData) {
        // B. 管理员直发：直接根据新提交的数据开号 (无 ID)
        // 1. 先查找是否已有该手机号的经销商 (通过 phone 去重)
        const { data: existingDealer } = await supabaseAdmin
            .from('dealers')
            .select('id')
            .eq('phone', certData.phone)
            .maybeSingle();

        let dealerId;
        if (existingDealer) {
            dealerId = existingDealer.id;
            // 保留原有的公司名，不要覆盖
        } else {
            const { data: newDealer, error: insErr } = await supabaseAdmin
                .from('dealers')
                .insert({ 
                    company_name: certData.shopName,
                    phone: certData.phone 
                })
                .select('id')
                .single();
            
            if (insErr || !newDealer) throw new Error(`经销商（${certData.shopName}）基础档案录入失败: ${insErr?.message}`);
            dealerId = newDealer.id;
        }

        certNumber = `BAVP-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;

        const { data: newCert, error: certErr } = await supabaseAdmin.from('certificates').insert({
            cert_number: certNumber,
            dealer_id: dealerId,
            auth_scope: certData.platformId + ' | ' + certData.scopeText + ' | ' + (certData.authorizer || "旎柏（上海）商贸有限公司"),
            start_date: certData.duration.split(' - ')[0].replace(/\./g, '-'),
            end_date: certData.duration.split(' - ')[1].replace(/\./g, '-'),
            status: 'ISSUED', 
            final_image_url: null,  // 不保存图片，用户在线生成
            seal_url: null,
            manager_id: managerId
        }).select('*, dealers(*)').single();

        if (certErr) throw certErr;
        certDataDb = newCert;
      } else {
        throw new Error("缺少核发数据");
      }

      // 图片由用户实时生成，不保存
      // 注：如果没有提供certImageDataUrl，final_image_url保持为NULL，
      // 经销商下载时会自动打开生成器进行生成

      const phone = certDataDb.dealers.phone;
      const passwordHash = await bcrypt.hash(phone, 10);

      // 1. 创建经销商本地账户 (不使用 Supabase auth)
      // 注意：按手机号（username）关联，同一手机号为同一账户
      // 先检查是否已有此电话号的经销商账户
      const { data: existingProfile } = await supabaseAdmin
        .from('profiles')
        .select('id, is_first_login')
        .eq('username', phone)  // 按 username（手机号）查询
        .maybeSingle();

      let profileId;
      if (existingProfile) {
        // 已存在，仅更新密码（不重置 is_first_login，保留原有状态）
        profileId = existingProfile.id;
        await supabaseAdmin
          .from('profiles')
          .update({ password_hash: passwordHash })
          .eq('id', profileId);
      } else {
        // 新建账户：生成一个临时 UUID 作为 profile id（不需要实际的 auth.users）
        const { data: newProfile, error: profileErr } = await supabaseAdmin
          .from('profiles')
          .insert({
            id: crypto.randomUUID(),
            username: phone,  // 关键：username 存储手机号，用于关联
            full_name: certDataDb.dealers.company_name,
            phone: phone,
            password_hash: passwordHash,
            role: 'DEALER',
            is_first_login: true
          })
          .select('id')
          .single();

        if (profileErr || !newProfile) {
          throw new Error(`经销商账户创建失败: ${profileErr?.message}`);
        }
        profileId = newProfile.id;
      }

      // 2. 如果是从待审核转为ISSUED，需要更新证书状态
      if (certId) {
        const { error: updateErr } = await supabaseAdmin
          .from('certificates')
          .update({ 
            status: 'ISSUED', 
            manager_id: managerId
          })
          .eq('id', certId);

        if (updateErr) throw updateErr;
      }

      return NextResponse.json({ success: true, status: 'ISSUED', phone, password: phone });
    }

    // --- 流程 3: 吊销证书 (管理员行为) ---
    if (action === 'revoke_certificate') {
        const { data: cert, error: certErr } = await supabaseAdmin
            .from('certificates')
            .select('*, dealers(*)')
            .eq('id', certId)
            .single();
        
        if (certErr || !cert) throw new Error("未找到对应证书");

        // 更新数据库状态为 REVOKED
        const { error: updateErr } = await supabaseAdmin
            .from('certificates')
            .update({ status: 'REVOKED' })
            .eq('id', certId);
        
        if (updateErr) throw updateErr;

        return NextResponse.json({ success: true, status: 'REVOKED' });
    }

    // --- 流程 4: 退回/拒绝 审核员提交的申请 ---
    if (action === 'reject_pending') {
      if (!certId) throw new Error("缺少证书 ID");

      const { error: updateErr } = await supabaseAdmin
        .from('certificates')
        .update({ status: 'REJECTED', manager_id: managerId })
        .eq('id', certId)
        .eq('status', 'PENDING'); // 只能退回 PENDING 状态的申请

      if (updateErr) throw updateErr;

      return NextResponse.json({ success: true, status: 'REJECTED' });
    }

    // --- 流程 5: 更新证书信息 (管理员修正笔误等) ---
    if (action === 'update_certificate') {
      if (!certId) throw new Error("缺少证书 ID");
      if (!certData) throw new Error("缺少更新数据");

      // 1. 获取原证书记录以找到 dealer_id
      const { data: oldCert, error: oldErr } = await supabaseAdmin
        .from('certificates')
        .select('*')
        .eq('id', certId)
        .single();
      
      if (oldErr || !oldCert) throw new Error("未找到对应证书记录");

      // 2. 更新经销商资料 (按手机号去重逻辑，如果手机号变了可能涉及迁移，暂时仅更新当前内容)
      const { error: dealerUpdErr } = await supabaseAdmin
        .from('dealers')
        .update({
          company_name: certData.shopName,
          phone: certData.phone
        })
        .eq('id', oldCert.dealer_id);
      
      if (dealerUpdErr) throw dealerUpdErr;

      // 3. 图片由用户实时生成，不保存更新

      // 4. 更新证书核心字段
      const { error: updateCertErr } = await supabaseAdmin
        .from('certificates')
        .update({
          auth_scope: certData.platformId + ' | ' + certData.scopeText + ' | ' + (certData.authorizer || "旎柏（上海）商贸有限公司"),
          start_date: certData.duration.split(' - ')[0].replace(/\./g, '-'),
          end_date: certData.duration.split(' - ')[1].replace(/\./g, '-'),
          manager_id: managerId // 记录最后一个修改的人
        })
        .eq('id', certId);

      if (updateCertErr) throw updateCertErr;

      return NextResponse.json({ success: true, status: 'UPDATED' });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

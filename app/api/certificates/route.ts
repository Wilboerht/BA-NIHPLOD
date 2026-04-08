import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';

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

    // --- 流程 1: 审核员提报 (录入数据，状态为 PENDING) ---
    if (action === 'create_pending') {
      // 创建或获取经销商 (不在此处创建 Auth 账户)
      // 先查找是否已有该经销商名，避免 upsert 冲突
      const { data: existingDealer } = await supabaseAdmin
          .from('dealers')
          .select('id')
          .eq('company_name', certData.shopName)
          .maybeSingle();

      let dealerId;
      if (existingDealer) {
          dealerId = existingDealer.id;
          // 同步更新电话
          await supabaseAdmin.from('dealers').update({ phone: certData.phone }).eq('id', dealerId);
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

      const { data: cert, error: certErr } = await supabaseAdmin.from('certificates').insert({
        cert_number: `BAVP-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`,
        dealer_id: dealerId,
        auth_scope: certData.platformId + ' | ' + certData.scopeText,
        start_date: certData.duration.split(' - ')[0].replace(/\./g, '-'),
        end_date: certData.duration.split(' - ')[1].replace(/\./g, '-'),
        status: 'PENDING', // 待审核
        manager_id: managerId
      }).select().single();

      if (certErr) throw certErr;
      return NextResponse.json({ success: true, status: 'PENDING' });
    }

    // --- 流程 2: 项目负责人审核通过并核发 (创建账户 + 状态转为 ISSUED) ---
    if (action === 'approve_issue') {
      let certDataDb;
      
      if (certId) {
        // A. 系统流程：处理已有的待审核记录 (通过 ID)
        const { data: dbData, error: getCertErr } = await supabaseAdmin
          .from('certificates')
          .select('*, dealers(*)')
          .eq('id', certId)
          .single();
        if (getCertErr || !dbData) throw new Error("未找到待审核证书 (ID: " + certId + ")");
        certDataDb = dbData;
      } else if (certData) {
        // B. 管理员直发：直接根据新提交的数据开号 (无 ID)
        // 1. 先查找是否已有该经销商名 (回避 upsert 对 Unique 索引的强一致性要求)
        const { data: existingDealer } = await supabaseAdmin
            .from('dealers')
            .select('id')
            .eq('company_name', certData.shopName)
            .maybeSingle();

        let dealerId;
        if (existingDealer) {
            dealerId = existingDealer.id;
            // 同步更新电话
            await supabaseAdmin.from('dealers').update({ phone: certData.phone }).eq('id', dealerId);
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

        const { data: newCert, error: certErr } = await supabaseAdmin.from('certificates').insert({
            cert_number: `BAVP-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`,
            dealer_id: dealerId,
            auth_scope: certData.platformId + ' | ' + certData.scopeText,
            start_date: certData.duration.split(' - ')[0].replace(/\./g, '-'),
            end_date: certData.duration.split(' - ')[1].replace(/\./g, '-'),
            status: 'ISSUED', 
            manager_id: managerId
        }).select('*, dealers(*)').single();

        if (certErr) throw certErr;
        certDataDb = newCert;
      } else {
        throw new Error("缺少核发数据");
      }

      const phone = certDataDb.dealers.phone;
      const passwordHash = await bcrypt.hash(phone, 10);

      // 1. 创建经销商本地账户 (不使用 Supabase auth)
      // 先检查是否已有此电话号的经销商账户
      const { data: existingProfile } = await supabaseAdmin
        .from('profiles')
        .select('id, is_first_login')
        .eq('phone', phone)
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
            username: phone,
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
          .update({ status: 'ISSUED', manager_id: managerId }) // 记录最终核发人
          .eq('id', certId);

        if (updateErr) throw updateErr;
      }

      return NextResponse.json({ success: true, status: 'ISSUED', phone, password: phone });
    }

    // --- 流程 3: 吊销证书 (管理员行为，同步禁用账户) ---
    if (action === 'revoke_certificate') {
        const { data: cert, error: certErr } = await supabaseAdmin
            .from('certificates')
            .select('*, dealers(*)')
            .eq('id', certId)
            .single();
        
        if (certErr || !cert) throw new Error("未找到对应证书");

        // 1. 更新数据库状态 (使用现有的 EXPIRED 状态，因为 REVOKED 不在 enum 中)
        const { error: updateErr } = await supabaseAdmin
            .from('certificates')
            .update({ status: 'EXPIRED' })
            .eq('id', certId);
        
        if (updateErr) throw updateErr;

        // 2. 证书已吊销，不封禁账户 (因为管理员可能需要重新核发)

        return NextResponse.json({ success: true, status: 'EXPIRED' });
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

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

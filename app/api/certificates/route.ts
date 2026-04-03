import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

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
      const { data: dealer, error: queryErr } = await supabaseAdmin
        .from('dealers')
        .upsert({ company_name: certData.shopName }, { onConflict: 'company_name' })
        .select('id')
        .single();
      
      if (queryErr || !dealer) throw new Error("经销商资料录入失败");

      const { data: cert, error: certErr } = await supabaseAdmin.from('certificates').insert({
        cert_number: `BAVP-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`,
        dealer_id: dealer.id,
        auth_scope: certData.platformId + ' | ' + certData.scopeText.substring(0, 50),
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
      const { data: certDataDb, error: getCertErr } = await supabaseAdmin
        .from('certificates')
        .select('*, dealers(*)')
        .eq('id', certId)
        .single();
      
      if (getCertErr || !certDataDb) throw new Error("未找到待审核证书");

      const platformId = certDataDb.auth_scope.split(' | ')[0];
      const email = `${platformId}@ba.nihplod.cn`;
      const password = platformId;

      // 1. 创建经销商 Auth 账户
      const { data: authUser, error: authErr } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { dealer_id: certDataDb.dealer_id }
      });

      if (authErr && !authErr.message.includes('already been registered')) throw authErr;

      const userId = authUser?.user?.id || (await supabaseAdmin.auth.admin.listUsers()).data.users.find(u => u.email === email)?.id;

      if (userId) {
          await supabaseAdmin.from('profiles').upsert({
              id: userId,
              username: platformId,
              full_name: certDataDb.dealers.company_name,
              role: 'DEALER',
              is_first_login: true
          });
      }

      // 2. 更新证书状态为 ISSUED
      const { error: updateErr } = await supabaseAdmin
        .from('certificates')
        .update({ status: 'ISSUED', manager_id: managerId }) // 记录最终核发人
        .eq('id', certId);

      if (updateErr) throw updateErr;

      return NextResponse.json({ success: true, status: 'ISSUED', email, password });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

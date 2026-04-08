import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { userId, oldPassword, newPassword } = body;

    if (!userId || !oldPassword || !newPassword) {
      return NextResponse.json(
        { error: '缺少必要参数' },
        { status: 400 }
      );
    }

    if (newPassword.length < 6) {
      return NextResponse.json(
        { error: '新密码至少6位' },
        { status: 400 }
      );
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseServiceRole = process.env.SUPABASE_SERVICE_ROLE_KEY!;

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRole, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });

    // 1. 查询现有密码
    const { data: profile, error: profileErr } = await supabaseAdmin
      .from('profiles')
      .select('password_hash')
      .eq('id', userId)
      .single();

    if (profileErr || !profile) {
      return NextResponse.json(
        { error: '用户不存在' },
        { status: 404 }
      );
    }

    // 2. 验证旧密码
    const isOldPasswordValid = await bcrypt.compare(oldPassword, profile.password_hash || '');
    if (!isOldPasswordValid) {
      return NextResponse.json(
        { error: '旧密码错误' },
        { status: 401 }
      );
    }

    // 3. 哈希新密码
    const newPasswordHash = await bcrypt.hash(newPassword, 10);

    // 4. 更新数据库
    const { error: updateErr } = await supabaseAdmin
      .from('profiles')
      .update({ 
        password_hash: newPasswordHash,
        is_first_login: false,
        updated_at: new Date().toISOString()
      })
      .eq('id', userId);

    if (updateErr) {
      throw updateErr;
    }

    return NextResponse.json({ success: true, message: '密码修改成功' });
  } catch (err: any) {
    console.error('Change password error:', err);
    return NextResponse.json(
      { error: '修改密码失败：' + err.message },
      { status: 500 }
    );
  }
}

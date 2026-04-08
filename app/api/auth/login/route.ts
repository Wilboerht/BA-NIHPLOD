import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { phone, password, loginType } = body;

    if (!phone || !password) {
      return NextResponse.json(
        { error: '请输入手机号和密码' },
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

    // 1. 查询 profiles 表获取用户
    const { data: profile, error: profileErr } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .eq('phone', phone)
      .maybeSingle();

    if (profileErr || !profile) {
      return NextResponse.json(
        { error: '账号或密码错误' },
        { status: 401 }
      );
    }

    // 2. 验证密码
    const isPasswordValid = await bcrypt.compare(password, profile.password_hash || '');
    if (!isPasswordValid) {
      return NextResponse.json(
        { error: '账号或密码错误' },
        { status: 401 }
      );
    }

    // 3. 返回用户信息和是否需要改密码
    return NextResponse.json({
      success: true,
      user: {
        id: profile.id,
        phone: profile.phone,
        username: profile.username,
        full_name: profile.full_name,
        role: profile.role,
        is_first_login: profile.is_first_login
      }
    });
  } catch (err: any) {
    console.error('Login error:', err);
    return NextResponse.json(
      { error: '登录失败：' + err.message },
      { status: 500 }
    );
  }
}

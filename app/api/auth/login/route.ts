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
    // 支持用 phone、username、email 登录
    let profile = null;
    let profileErr = null;
    
    // 先尝试用 phone 查询
    const { data: phoneProfile, error: phoneErr } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .eq('phone', phone)
      .maybeSingle();
    
    if (phoneProfile) {
      profile = phoneProfile;
    } else if (!phoneErr) {
      // phone 查询无错误但没找到，再用 username 查询
      const { data: usernameProfile, error: usernameErr } = await supabaseAdmin
        .from('profiles')
        .select('*')
        .eq('username', phone)
        .maybeSingle();
      
      if (usernameProfile) {
        profile = usernameProfile;
      } else if (!usernameErr) {
        // username 查询无错误但没找到，再用小写 username 查询
        const { data: usernameLowerProfile, error: usernameLowerErr } = await supabaseAdmin
          .from('profiles')
          .select('*')
          .eq('username', phone.toLowerCase())
          .maybeSingle();
        
        profile = usernameLowerProfile;
        profileErr = usernameLowerErr;
      } else {
        profileErr = usernameErr;
      }
    } else {
      profileErr = phoneErr;
    }

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

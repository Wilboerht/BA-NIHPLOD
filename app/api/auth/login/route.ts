import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { findProfileForLogin } from '@/lib/db';

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

    // 1. 使用双擎 DB 适配器查询 profiles 获取用户
    // 支持按 phone、username 或 email 登录 (忽略大小写)
    const { data: profile, error: profileErr } = await findProfileForLogin(phone);
    
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

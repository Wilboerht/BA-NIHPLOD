import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { findProfileForLogin } from '@/lib/db';
import { createToken, setAuthCookie } from '@/lib/auth';

// 内存级登录限速：{ ip -> { count, resetTime } }
const loginAttempts = new Map<string, { count: number; resetTime: number }>();
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 5 * 60 * 1000; // 5 分钟

function getClientIP(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  return 'unknown';
}

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const record = loginAttempts.get(ip);

  if (!record || now > record.resetTime) {
    loginAttempts.set(ip, { count: 1, resetTime: now + WINDOW_MS });
    return true;
  }

  if (record.count >= MAX_ATTEMPTS) {
    return false;
  }

  record.count++;
  return true;
}

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

    // 登录限速检查
    const clientIP = getClientIP(req);
    if (!checkRateLimit(clientIP)) {
      return NextResponse.json(
        { error: '登录尝试次数过多，请 5 分钟后再试' },
        { status: 429 }
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

    // 2. 检查是否被封禁
    if (profile.is_banned) {
      return NextResponse.json(
        { error: '账号已被封禁，请联系管理员' },
        { status: 403 }
      );
    }

    // 3. 验证密码
    const isPasswordValid = await bcrypt.compare(password, profile.password_hash || '');
    
    if (!isPasswordValid) {
      return NextResponse.json(
        { error: '账号或密码错误' },
        { status: 401 }
      );
    }

    // 4. 签发 JWT 并设置 Cookie
    const token = await createToken({
      id: profile.id,
      username: profile.username,
      phone: profile.phone,
      full_name: profile.full_name,
      role: profile.role,
    });

    // 5. 返回用户信息和是否需要改密码
    const response = NextResponse.json({
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

    response.headers.set('Set-Cookie', setAuthCookie(token));
    return response;
  } catch (err: unknown) {
    console.error('Login error:', err);
    return NextResponse.json(
      { error: '登录失败' },
      { status: 500 }
    );
  }
}

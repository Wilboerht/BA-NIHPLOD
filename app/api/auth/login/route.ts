import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { findProfileForLogin, sql } from '@/lib/db';
import { createToken, setAuthCookie } from '@/lib/auth';

const MAX_ATTEMPTS = 5;
const WINDOW_MS = 5 * 60 * 1000; // 5 分钟

function getClientIP(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  return 'unknown';
}

async function checkRateLimit(ip: string): Promise<boolean> {
  const now = new Date();
  const windowStart = new Date(Date.now() - WINDOW_MS);

  try {
    // 查询当前 IP 的限速记录
    const records = await sql`
      SELECT attempts, window_start FROM login_rate_limits
      WHERE ip = ${ip}
      LIMIT 1
    `;

    if (records.length === 0) {
      // 新记录
      await sql`
        INSERT INTO login_rate_limits (ip, attempts, window_start)
        VALUES (${ip}, 1, ${now})
      `;
      return true;
    }

    const record = records[0];
    const recordWindowStart = new Date(record.window_start);

    if (recordWindowStart < windowStart) {
      // 窗口已过期，重置
      await sql`
        UPDATE login_rate_limits
        SET attempts = 1, window_start = ${now}
        WHERE ip = ${ip}
      `;
      return true;
    }

    if (record.attempts >= MAX_ATTEMPTS) {
      return false;
    }

    // 增加尝试次数
    await sql`
      UPDATE login_rate_limits
      SET attempts = attempts + 1
      WHERE ip = ${ip}
    `;
    return true;
  } catch {
    // 数据库故障时保守允许（避免完全锁死登录），但记录日志
    console.error('[RateLimit] 数据库查询失败，跳过限速检查');
    return true;
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { phone, password } = body;

    if (!phone || !password) {
      return NextResponse.json(
        { error: '请输入手机号和密码' },
        { status: 400 }
      );
    }

    // 登录限速检查（持久化到数据库）
    const clientIP = getClientIP(req);
    if (!(await checkRateLimit(clientIP))) {
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

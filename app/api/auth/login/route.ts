import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { findProfileForLogin, sql } from '@/lib/db';
import { createToken, setAuthCookie } from '@/lib/auth';

const MAX_ATTEMPTS = 5;
const WINDOW_MS = 5 * 60 * 1000; // 5 分钟

function getClientIP(req: Request): string {
  // x-real-ip 由可信反向代理设置，比 x-forwarded-for 更难伪造
  const realIp = req.headers.get('x-real-ip');
  if (realIp) return realIp.trim();

  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) {
    // 取第一个 IP（客户端真实 IP），配合可信反向代理使用
    const ips = forwarded.split(',').map(s => s.trim()).filter(Boolean);
    return ips[0] || 'unknown';
  }
  return 'unknown';
}

async function checkRateLimit(ip: string): Promise<boolean> {
  const now = new Date();
  const windowStart = new Date(Date.now() - WINDOW_MS);

  try {
    // 低概率清理过期记录（避免每次请求都执行）
    if (Math.random() < 0.01) {
      await sql`
        DELETE FROM login_rate_limits
        WHERE window_start < ${windowStart}
      `;
    }

    // 原子性 UPSERT：插入或更新，并返回最新值
    const result = await sql`
      INSERT INTO login_rate_limits (ip, attempts, window_start)
      VALUES (${ip}, 1, ${now})
      ON CONFLICT (ip) DO UPDATE SET
        attempts = CASE
          WHEN login_rate_limits.window_start < ${windowStart} THEN 1
          WHEN login_rate_limits.attempts >= ${MAX_ATTEMPTS} THEN login_rate_limits.attempts
          ELSE login_rate_limits.attempts + 1
        END,
        window_start = CASE
          WHEN login_rate_limits.window_start < ${windowStart} THEN ${now}
          ELSE login_rate_limits.window_start
        END
      RETURNING attempts, window_start
    `;

    const record = result[0];
    const recordWindowStart = new Date(record.window_start);

    // 窗口已过期（理论上已被重置，双重保险）
    if (recordWindowStart < windowStart) {
      return true;
    }

    return record.attempts < MAX_ATTEMPTS;
  } catch {
    // 数据库故障时安全优先：拒绝服务，防止在数据库异常时被暴力破解
    console.error('[RateLimit] 数据库查询失败，拒绝登录以保障安全');
    return false;
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
    const passwordHash = typeof profile.password_hash === 'string' ? profile.password_hash : '';
    const isPasswordValid = await bcrypt.compare(password, passwordHash);
    
    if (!isPasswordValid) {
      return NextResponse.json(
        { error: '账号或密码错误' },
        { status: 401 }
      );
    }

    // 4. 签发 JWT 并设置 Cookie
    const token = await createToken({
      id: String(profile.id),
      username: typeof profile.username === 'string' ? profile.username : undefined,
      phone: typeof profile.phone === 'string' ? profile.phone : undefined,
      full_name: typeof profile.full_name === 'string' ? profile.full_name : undefined,
      role: String(profile.role),
      is_banned: Boolean(profile.is_banned),
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
    const statusCode = (err as Error & { statusCode?: number }).statusCode;
    if (statusCode === 503) {
      return NextResponse.json(
        { error: '服务暂时不可用，请稍后重试' },
        { status: 503 }
      );
    }
    return NextResponse.json(
      { error: '登录失败' },
      { status: 500 }
    );
  }
}

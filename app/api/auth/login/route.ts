import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { findProfileForLogin, sql } from '@/lib/db';
import { createToken, setAuthCookie } from '@/lib/auth';
import { readJsonBody } from '@/lib/api-utils';

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

/**
 * 查询当前 IP 是否已被限流
 * 采用「仅失败计数、成功清零」策略，避免正常用户被误封
 */
async function isRateLimited(ip: string): Promise<boolean> {
  try {
    const rows = await sql`
      SELECT attempts, window_start
      FROM login_rate_limits
      WHERE ip = ${ip}
      LIMIT 1
    `;
    if (rows.length === 0) return false;

    const windowStart = new Date(Date.now() - WINDOW_MS);
    const record = rows[0];
    const recordWindowStart = new Date(record.window_start);
    return recordWindowStart >= windowStart && Number(record.attempts) >= MAX_ATTEMPTS;
  } catch {
    // 数据库故障时安全优先：拒绝服务，防止在数据库异常时被暴力破解
    console.error('[RateLimit] 数据库查询失败，拒绝登录以保障安全');
    return true;
  }
}

/**
 * 记录一次登录失败（窗口内累加，过期重置）
 */
async function recordFailedAttempt(ip: string): Promise<void> {
  const windowStart = new Date(Date.now() - WINDOW_MS);

  try {
    await sql`
      INSERT INTO login_rate_limits (ip, attempts, window_start)
      VALUES (${ip}, 1, NOW())
      ON CONFLICT (ip) DO UPDATE SET
        attempts = CASE
          WHEN login_rate_limits.window_start < ${windowStart} THEN 1
          ELSE login_rate_limits.attempts + 1
        END,
        window_start = CASE
          WHEN login_rate_limits.window_start < ${windowStart} THEN NOW()
          ELSE login_rate_limits.window_start
        END
    `;

    // 低概率清理过期记录（避免每次请求都执行）
    if (Math.random() < 0.01) {
      await sql`DELETE FROM login_rate_limits WHERE window_start < ${windowStart}`;
    }
  } catch (err) {
    console.error('[RateLimit] 记录登录失败次数失败:', err);
  }
}

/**
 * 登录成功后清除失败计数
 */
async function clearFailedAttempts(ip: string): Promise<void> {
  try {
    await sql`DELETE FROM login_rate_limits WHERE ip = ${ip}`;
  } catch (err) {
    console.error('[RateLimit] 清除登录失败计数失败:', err);
  }
}

export async function POST(req: Request) {
  try {
    const { data: body, response: bodyError } = await readJsonBody<{ phone?: string; password?: string }>(req);
    if (bodyError) return bodyError;

    const { phone, password } = body!;

    if (!phone || !password) {
      return NextResponse.json(
        { error: '请输入手机号和密码' },
        { status: 400 }
      );
    }

    // 登录限速检查（仅统计失败次数，成功登录会清零）
    const clientIP = getClientIP(req);
    if (await isRateLimited(clientIP)) {
      return NextResponse.json(
        { error: '登录尝试次数过多，请 5 分钟后再试' },
        { status: 429 }
      );
    }

    // 1. 使用双擎 DB 适配器查询 profiles 获取用户
    // 支持按 phone、username 或 email 登录 (忽略大小写)
    const { data: profile, error: profileErr } = await findProfileForLogin(phone);
    
    if (profileErr || !profile) {
      await recordFailedAttempt(clientIP);
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
      await recordFailedAttempt(clientIP);
      return NextResponse.json(
        { error: '账号或密码错误' },
        { status: 401 }
      );
    }

    // 登录成功：清除失败计数
    await clearFailedAttempts(clientIP);

    // 4. 签发 JWT 并设置 Cookie
    const token = await createToken({
      id: String(profile.id),
      username: typeof profile.username === 'string' ? profile.username : undefined,
      phone: typeof profile.phone === 'string' ? profile.phone : undefined,
      full_name: typeof profile.full_name === 'string' ? profile.full_name : undefined,
      role: String(profile.role),
      is_banned: Boolean(profile.is_banned),
      token_version: Number(profile.token_version ?? 0),
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

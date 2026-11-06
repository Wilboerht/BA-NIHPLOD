import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { findProfileForLogin, sql } from '@/lib/db';
import { createToken, setAuthCookie } from '@/lib/auth';
import { readJsonBody } from '@/lib/api-utils';
import { actorFromUser, writeAudit } from '@/lib/audit';
import { getClientIpFromRequest } from '@/lib/request-ip';

const MAX_ATTEMPTS = 5;
const ACCOUNT_MAX_ATTEMPTS = 10;
const WINDOW_MS = 5 * 60 * 1000; // 5 分钟

// 账号不存在时也执行一次同成本的 bcrypt 比较，降低账号枚举时序差
const LOGIN_FAILURE_DUMMY_HASH = '$2b$12$Ki07Mawh4ZW893rYj2GKAuXGcfXmz/4405eHG0sajjkP.I5OlaXwm';

/**
 * 查询当前限流 key 是否已被限流
 * 采用「仅失败计数、成功清零」策略，避免正常用户被误封
 */
async function isRateLimited(key: string, maxAttempts = MAX_ATTEMPTS): Promise<boolean> {
  try {
    const rows = await sql`
      SELECT attempts, window_start
      FROM login_rate_limits
      WHERE ip = ${key}
      LIMIT 1
    `;
    if (rows.length === 0) return false;

    const windowStart = new Date(Date.now() - WINDOW_MS);
    const record = rows[0];
    const recordWindowStart = new Date(record.window_start);
    return recordWindowStart >= windowStart && Number(record.attempts) >= maxAttempts;
  } catch {
    // 数据库故障时安全优先：拒绝服务，防止在数据库异常时被暴力破解
    console.error('[RateLimit] 数据库查询失败，拒绝登录以保障安全');
    return true;
  }
}

/**
 * 记录一次登录失败（窗口内累加，过期重置）
 */
async function recordFailedAttempt(key: string): Promise<void> {
  const windowStart = new Date(Date.now() - WINDOW_MS);

  try {
    await sql`
      INSERT INTO login_rate_limits (ip, attempts, window_start)
      VALUES (${key}, 1, NOW())
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
async function clearFailedAttempts(key: string): Promise<void> {
  try {
    await sql`DELETE FROM login_rate_limits WHERE ip = ${key}`;
  } catch (err) {
    console.error('[RateLimit] 清除登录失败计数失败:', err);
  }
}

export async function POST(req: Request) {
  try {
    const { data: body, response: bodyError } = await readJsonBody<{ phone?: string; password?: string }>(req);
    if (bodyError) return bodyError;

    const { phone, password } = body!;

    if (
      typeof phone !== 'string'
      || typeof password !== 'string'
      || !phone
      || !password
      || phone.length > 255
      || password.length > 1024
    ) {
      return NextResponse.json(
        { error: '请输入手机号和密码' },
        { status: 400 }
      );
    }

    // 登录限速检查（仅统计失败次数，成功登录会清零）
    const clientIP = getClientIpFromRequest(req);
    const accountKey = `acct:${phone.trim().toLowerCase().slice(0, 255)}`;
    const [ipLimited, accountLimited] = await Promise.all([
      isRateLimited(clientIP),
      isRateLimited(accountKey, ACCOUNT_MAX_ATTEMPTS),
    ]);
    if (ipLimited || accountLimited) {
      return NextResponse.json(
        { error: '登录尝试次数过多，请 5 分钟后再试' },
        { status: 429 }
      );
    }

    // 1. 使用双擎 DB 适配器查询 profiles 获取用户
    // 支持按 phone、username 或 email 登录 (忽略大小写)
    const { data: profile, error: profileErr } = await findProfileForLogin(phone);
    if (profileErr) {
      throw profileErr;
    }

    if (!profile) {
      // 不存在的账号也执行一次 bcrypt，避免明显的响应时间差
      await bcrypt.compare(password, LOGIN_FAILURE_DUMMY_HASH);
      await recordFailedAttempt(clientIP);
      await recordFailedAttempt(accountKey);
      try {
        await writeAudit(sql, {
          action: 'LOGIN_FAILED',
          targetType: 'profile',
          targetRef: phone.slice(0, 100),
          comment: '账号不存在',
          reason: 'invalid_credentials',
          request: req,
        });
      } catch (auditErr) {
        console.error('[audit] LOGIN_FAILED 写入失败:', auditErr);
      }
      return NextResponse.json(
        { error: '账号或密码错误' },
        { status: 401 }
      );
    }

    const profileActor = actorFromUser({
      id: String(profile.id),
      role: typeof profile.role === 'string' ? profile.role : undefined,
      full_name: typeof profile.full_name === 'string' ? profile.full_name : undefined,
      username: typeof profile.username === 'string' ? profile.username : undefined,
    });

    // 2. 验证密码（即使账号被封禁也先验证，避免通过响应差异枚举账号）
    const passwordHash = typeof profile.password_hash === 'string' && profile.password_hash
      ? profile.password_hash
      : LOGIN_FAILURE_DUMMY_HASH;
    const isPasswordValid = await bcrypt.compare(password, passwordHash);

    if (!isPasswordValid) {
      await recordFailedAttempt(clientIP);
      await recordFailedAttempt(accountKey);
      try {
        await writeAudit(sql, {
          actor: profileActor,
          action: 'LOGIN_FAILED',
          targetType: 'profile',
          targetId: String(profile.id),
          comment: '密码错误',
          reason: 'invalid_credentials',
          request: req,
        });
      } catch (auditErr) {
        console.error('[audit] LOGIN_FAILED 写入失败:', auditErr);
      }
      return NextResponse.json(
        { error: '账号或密码错误' },
        { status: 401 }
      );
    }

    // 3. 密码正确后再检查封禁状态
    if (profile.is_banned) {
      await recordFailedAttempt(clientIP);
      await recordFailedAttempt(accountKey);
      try {
        await writeAudit(sql, {
          actor: profileActor,
          action: 'LOGIN_BLOCKED',
          targetType: 'profile',
          targetId: String(profile.id),
          comment: '账号已被封禁',
          reason: 'account_banned',
          request: req,
        });
      } catch (auditErr) {
        console.error('[audit] LOGIN_BLOCKED 写入失败:', auditErr);
      }
      return NextResponse.json(
        { error: '账号已被封禁，请联系管理员' },
        { status: 403 }
      );
    }

    // 登录成功：清除失败计数
    await clearFailedAttempts(clientIP);
    await clearFailedAttempts(accountKey);

    // 4. 签发 JWT 并设置 Cookie
    const token = await createToken({
      id: String(profile.id),
      username: typeof profile.username === 'string' ? profile.username : undefined,
      phone: typeof profile.phone === 'string' ? profile.phone : undefined,
      full_name: typeof profile.full_name === 'string' ? profile.full_name : undefined,
      role: String(profile.role),
      is_banned: Boolean(profile.is_banned),
      is_first_login: Boolean(profile.is_first_login),
      token_version: Number(profile.token_version ?? 0),
    });

    try {
      await writeAudit(sql, {
        actor: profileActor,
        action: 'LOGIN_SUCCESS',
        targetType: 'profile',
        targetId: String(profile.id),
        comment: `登录成功（IP: ${clientIP}）`,
        request: req,
      });
    } catch (auditErr) {
      console.error('[audit] LOGIN_SUCCESS 写入失败:', auditErr);
    }

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
    response.headers.set('Cache-Control', 'no-store');
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

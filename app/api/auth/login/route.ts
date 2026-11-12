import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { findProfileForLogin, sql } from '@/lib/db';
import { createToken, setAuthCookie } from '@/lib/auth';
import { verifyBreakGlassTotp } from '@/lib/totp';
import { parseLocalLoginMode } from '@/lib/admin-sso';
import { readJsonBody, isSameOriginRequest } from '@/lib/api-utils';
import { actorFromUser, writeAudit } from '@/lib/audit';
import { getClientIpFromRequest } from '@/lib/request-ip';

const MAX_ATTEMPTS = 5;
const ACCOUNT_MAX_ATTEMPTS = 10;
const WINDOW_MS = 5 * 60 * 1000; // 5 分钟

// 账号不存在时也执行一次同成本的 bcrypt 比较，降低账号枚举时序差
const LOGIN_FAILURE_DUMMY_HASH = '$2b$12$Ki07Mawh4ZW893rYj2GKAuXGcfXmz/4405eHG0sajjkP.I5OlaXwm';

interface LoginAttemptResult {
  limited: boolean;
  attempts: number;
}

/**
 * 原子地消耗一次登录尝试（按 key）。
 * 采用「请求前计数、成功清零」策略：并发请求无法在计数落库前全部通过。
 */
async function consumeLoginAttempt(
  key: string,
  maxAttempts = MAX_ATTEMPTS
): Promise<LoginAttemptResult> {
  const windowStart = new Date(Date.now() - WINDOW_MS);

  try {
    if (Math.random() < 0.01) {
      await sql`DELETE FROM login_rate_limits WHERE window_start < ${windowStart}`;
    }

    const rows = await sql`
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
      RETURNING attempts, window_start
    `;

    const record = rows[0];
    const recordWindowStart = new Date(record.window_start);
    const attempts = Number(record.attempts);
    return {
      limited: recordWindowStart >= windowStart && attempts > maxAttempts,
      attempts,
    };
  } catch {
    // 数据库故障时安全优先：拒绝服务，防止在数据库异常时被暴力破解
    console.error('[RateLimit] 数据库查询失败，拒绝登录以保障安全');
    return { limited: true, attempts: maxAttempts + 1 };
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
    if (!isSameOriginRequest(req)) {
      return NextResponse.json({ error: '非法请求来源' }, { status: 403 });
    }
    const { data: body, response: bodyError } = await readJsonBody<{ phone?: string; password?: string; totpCode?: string }>(req);
    if (bodyError) return bodyError;

    const { phone, password, totpCode } = body!;

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

    // 登录限速：请求前原子计数，成功登录会清零；并发请求无法绕过
    const clientIP = getClientIpFromRequest(req);
    const accountKey = `acct:${phone.trim().toLowerCase().slice(0, 255)}`;
    const [ipAttempt, accountAttempt] = await Promise.all([
      consumeLoginAttempt(clientIP, MAX_ATTEMPTS),
      consumeLoginAttempt(accountKey, ACCOUNT_MAX_ATTEMPTS),
    ]);
    if (ipAttempt.limited || accountAttempt.limited) {
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

    const authSource = typeof profile.auth_source === 'string' ? profile.auth_source : 'local';
    if (authSource === 'sso') {
      // SSO 账号没有本地密码：执行同等成本的 bcrypt 并写审计，
      // 避免通过响应时间差区分账号类型（失败次数已在请求前原子计入）。
      await bcrypt.compare(password, LOGIN_FAILURE_DUMMY_HASH);
      try {
        await writeAudit(sql, {
          actor: profileActor,
          action: 'LOGIN_FAILED',
          targetType: 'profile',
          targetId: String(profile.id),
          comment: 'SSO 账号尝试本地密码登录',
          reason: 'sso_required',
          request: req,
        });
      } catch (auditErr) {
        console.error('[audit] LOGIN_FAILED 写入失败:', auditErr);
      }
      return NextResponse.json(
        { error: '请使用 NIHPLOD 主站管理员账号登录', code: 'SSO_REQUIRED' },
        { status: 403 }
      );
    }

    // 2. 验证密码（即使账号被封禁也先验证，避免通过响应差异枚举账号）
    const passwordHash = typeof profile.password_hash === 'string' && profile.password_hash
      ? profile.password_hash
      : LOGIN_FAILURE_DUMMY_HASH;
    const isPasswordValid = await bcrypt.compare(password, passwordHash);

    if (!isPasswordValid) {
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

    const ssoEnabled = process.env.ADMIN_SSO_ENABLED === 'true';
    const localMode = parseLocalLoginMode(process.env.ADMIN_SSO_LOCAL_LOGIN_MODE);
    const breakGlassUsername = process.env.BA_BREAK_GLASS_USERNAME || 'ba-emergency';
    const breakGlassEnabled = process.env.BA_BREAK_GLASS_ENABLED === 'true';
    const isBreakGlassAccount = profile.username === breakGlassUsername;

    if (ssoEnabled && localMode === 'disabled') {
      return NextResponse.json(
        { error: '本地密码登录已关闭，请使用主站管理员账号登录', code: 'SSO_REQUIRED' },
        { status: 403 }
      );
    }
    if (
      ssoEnabled &&
      localMode === 'break-glass' &&
      (!breakGlassEnabled || !isBreakGlassAccount)
    ) {
      return NextResponse.json(
        { error: '本地密码登录仅限应急账号', code: 'SSO_REQUIRED' },
        { status: 403 }
      );
    }

    // 应急账号：无论开关如何，只要命中该用户名就必须启用并校验 TOTP，
    // 防止创建账号后忘记开启 BA_BREAK_GLASS_ENABLED 导致仅密码可登录。
    if (isBreakGlassAccount) {
      if (!breakGlassEnabled) {
        try {
          await writeAudit(sql, {
            actor: profileActor,
            action: 'LOGIN_BLOCKED',
            targetType: 'profile',
            targetId: String(profile.id),
            comment: '应急账号未启用',
            reason: 'break_glass_disabled',
            request: req,
          });
        } catch (auditErr) {
          console.error('[audit] LOGIN_BLOCKED 写入失败:', auditErr);
        }
        return NextResponse.json(
          { error: '应急账号未启用，请联系系统管理员' },
          { status: 403 }
        );
      }

      const totpSecret = process.env.BA_BREAK_GLASS_TOTP_SECRET;
      if (!totpSecret) {
        console.error('[login] BA_BREAK_GLASS_TOTP_SECRET 未配置');
        return NextResponse.json({ error: '应急账号未完成 TOTP 配置' }, { status: 503 });
      }
      if (!totpCode || !verifyBreakGlassTotp(totpCode, totpSecret)) {
        try {
          await writeAudit(sql, {
            actor: profileActor,
            action: 'LOGIN_FAILED',
            targetType: 'profile',
            targetId: String(profile.id),
            comment: '应急账号 TOTP 验证失败',
            reason: 'totp_invalid',
            request: req,
          });
        } catch (auditErr) {
          console.error('[audit] LOGIN_FAILED 写入失败:', auditErr);
        }
        return NextResponse.json(
          { error: 'TOTP 验证码错误', data: { totpRequired: true } },
          { status: 401 }
        );
      }
    }

    // 3. 密码正确后再检查封禁状态
    if (profile.is_banned) {
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

    try {
      await sql`
        UPDATE profiles
        SET last_login_at = NOW()
        WHERE id = ${String(profile.id)}
      `;
    } catch (error) {
      console.error('[login] last_login_at 更新失败:', error);
    }

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
      auth_source: typeof profile.auth_source === 'string' ? profile.auth_source : 'local',
      external_admin_id:
        typeof profile.external_admin_id === 'string' ? profile.external_admin_id : undefined,
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

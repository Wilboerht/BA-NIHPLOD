import { SignJWT, jwtVerify, JWTPayload } from 'jose';
import { NextRequest, NextResponse } from 'next/server';
import { sql } from './db';
import { ADMIN_ROLES } from '@/types';
import { parse } from 'cookie';
import crypto from 'crypto';

const TOKEN_COOKIE = 'auth-token';
const AUTH_SECRET = process.env.AUTH_SECRET;

function getSecret(): Uint8Array {
  if (AUTH_SECRET) {
    return new TextEncoder().encode(AUTH_SECRET);
  }
  throw new Error(
    '[auth] AUTH_SECRET environment variable is required. ' +
    'Please set a strong random string (at least 32 characters) in your .env.local file.'
  );
}

export interface AuthUser {
  id: string;
  username?: string;
  phone?: string;
  full_name?: string;
  role: string;
  is_banned?: boolean;
}

export interface TokenPayload extends JWTPayload {
  id: string;
  username?: string;
  phone?: string;
  full_name?: string;
  role: string;
  is_banned?: boolean;
  jti?: string;
}

/**
 * 签发 JWT Token
 */
export async function createToken(user: AuthUser): Promise<string> {
  const secret = getSecret();
  const jti = crypto.randomUUID();
  return new SignJWT({
    id: user.id,
    username: user.username,
    phone: user.phone,
    full_name: user.full_name,
    role: user.role,
    is_banned: user.is_banned ?? false,
    jti,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setIssuer('nihplod-bavp')
    .setAudience('nihplod-bavp')
    .setExpirationTime('8h')
    .sign(secret);
}

/**
 * 仅验证 JWT 签名和过期时间（Edge Runtime 安全，不依赖数据库）
 * 适用于 Middleware 等 Edge 环境
 */
export async function verifyTokenBasic(request: NextRequest | Request): Promise<TokenPayload | null> {
  try {
    const cookieHeader = request.headers.get('cookie');
    if (!cookieHeader) return null;

    const cookies = parse(cookieHeader);
    const token = cookies[TOKEN_COOKIE];
    if (!token) return null;

    const secret = getSecret();
    const { payload } = await jwtVerify(token, secret, {
      clockTolerance: 60,
      issuer: 'nihplod-bavp',
      audience: 'nihplod-bavp',
    });

    return payload as TokenPayload;
  } catch (err) {
    console.error('[verifyTokenBasic] JWT 验证失败:', err instanceof Error ? err.message : String(err));
    return null;
  }
}

/**
 * 完整验证 JWT（含黑名单检查）
 * 仅在 Node.js Runtime（API 路由、Server Action）中使用
 */
export async function verifyToken(request: NextRequest | Request): Promise<TokenPayload | null> {
  const payload = await verifyTokenBasic(request);
  if (!payload) return null;

  // 检查 Token 黑名单
  if (payload.jti) {
    try {
      // 顺带清理过期黑名单记录（1% 概率触发，避免每次请求都执行）
      if (Math.random() < 0.01) {
        await sql`SELECT cleanup_expired_blacklist()`;
      }
      const blacklisted = await sql`SELECT 1 FROM token_blacklist WHERE jti = ${payload.jti as string} LIMIT 1`;
      if (blacklisted.length > 0) {
        return null;
      }
    } catch (err) {
      console.error('[verifyToken] 黑名单查询失败，拒绝放行:', err instanceof Error ? err.message : String(err));
      return null;
    }
  }

  return payload;
}

/**
 * 验证用户已登录，返回用户信息
 * 若未登录则返回 401 响应
 * 同时查询数据库确认用户存在且未被禁用
 */
export async function requireAuth(request: NextRequest | Request) {
  const payload = await verifyToken(request);
  if (!payload || !payload.id) {
    return {
      user: null,
      response: NextResponse.json({ error: '未登录或登录已过期' }, { status: 401 }),
    };
  }

  // 查询数据库确认用户存在且未被禁用
  try {
    const rows = await sql`
      SELECT id, username, full_name, phone, role, is_banned
      FROM profiles
      WHERE id = ${payload.id}
      LIMIT 1
    `;
    if (rows.length === 0) {
      return {
        user: null,
        response: NextResponse.json({ error: '用户不存在' }, { status: 401 }),
      };
    }
    const profile = rows[0];
    if (profile.is_banned) {
      return {
        user: null,
        response: NextResponse.json({ error: '账号已被封禁' }, { status: 403 }),
      };
    }
    return {
      user: {
        id: String(profile.id),
        username: profile.username ?? undefined,
        full_name: profile.full_name ?? undefined,
        phone: profile.phone ?? undefined,
        role: String(profile.role),
      } as AuthUser,
      response: null,
    };
  } catch (err) {
    console.error('[requireAuth] 数据库查询失败:', err);
    return {
      user: null,
      response: NextResponse.json({ error: '认证服务异常' }, { status: 500 }),
    };
  }
}

/**
 * 验证用户为管理员，返回用户信息
 * 若非管理员则返回 403 响应
 */
export async function requireAdmin(request: NextRequest | Request) {
  const { user, response } = await requireAuth(request);
  if (response) {
    return { user: null, response };
  }

  if (!user?.role || !ADMIN_ROLES.includes(user.role as typeof ADMIN_ROLES[number])) {
    return {
      user: null,
      response: NextResponse.json({ error: '无权限执行此操作' }, { status: 403 }),
    };
  }

  return { user, response: null };
}

/**
 * 生成设置 Cookie 的响应头
 */
export function setAuthCookie(token: string): string {
  const isSecure = process.env.NODE_ENV === 'production';
  const parts = [
    `${TOKEN_COOKIE}=${token}`,
    'HttpOnly',
    isSecure ? 'Secure' : '',
    'SameSite=Lax',
    isSecure ? 'Partitioned' : '',
    'Path=/',
    'Max-Age=28800',
  ].filter(Boolean);
  return parts.join('; ');
}

/**
 * 生成清除 Cookie 的响应头
 */
export function clearAuthCookie(): string {
  const isSecure = process.env.NODE_ENV === 'production';
  const parts = [
    `${TOKEN_COOKIE}=`,
    'HttpOnly',
    isSecure ? 'Secure' : '',
    'SameSite=Lax',
    isSecure ? 'Partitioned' : '',
    'Path=/',
    'Max-Age=0',
    'Expires=Thu, 01 Jan 1970 00:00:00 GMT',
  ].filter(Boolean);
  return parts.join('; ');
}

/**
 * 验证密码强度
 * 要求：≥8 位，至少包含 1 个大写字母、1 个小写字母、1 个数字
 */
export function validatePassword(password: string): { valid: boolean; error?: string } {
  if (!password || password.length < 8) {
    return { valid: false, error: '密码长度不得少于 8 位' };
  }
  if (!/[A-Z]/.test(password)) {
    return { valid: false, error: '密码必须包含至少一个大写字母' };
  }
  if (!/[a-z]/.test(password)) {
    return { valid: false, error: '密码必须包含至少一个小写字母' };
  }
  if (!/[0-9]/.test(password)) {
    return { valid: false, error: '密码必须包含至少一个数字' };
  }
  return { valid: true };
}

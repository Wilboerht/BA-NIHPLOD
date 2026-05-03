import { SignJWT, jwtVerify, JWTPayload } from 'jose';
import { NextRequest, NextResponse } from 'next/server';

const TOKEN_COOKIE = 'auth-token';
const AUTH_SECRET = process.env.AUTH_SECRET;

function getSecret(): Uint8Array {
  if (AUTH_SECRET) {
    return new TextEncoder().encode(AUTH_SECRET);
  }
  // Fallback for development (not safe for production)
  console.warn('[auth] AUTH_SECRET not set, using fallback secret');
  return new TextEncoder().encode('fallback-secret-change-me-in-production-32');
}

export interface AuthUser {
  id: string;
  username?: string;
  phone?: string;
  full_name?: string;
  role: string;
}

export interface TokenPayload extends JWTPayload {
  id: string;
  username?: string;
  phone?: string;
  full_name?: string;
  role: string;
}

/**
 * 签发 JWT Token
 */
export async function createToken(user: AuthUser): Promise<string> {
  const secret = getSecret();
  return new SignJWT({
    id: user.id,
    username: user.username,
    phone: user.phone,
    full_name: user.full_name,
    role: user.role,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('24h')
    .sign(secret);
}

/**
 * 从请求中提取并验证 JWT
 */
export async function verifyToken(request: NextRequest | Request): Promise<TokenPayload | null> {
  try {
    const cookieHeader = request.headers.get('cookie');
    if (!cookieHeader) return null;

    const token = cookieHeader
      .split(';')
      .map(c => c.trim())
      .find(c => c.startsWith(`${TOKEN_COOKIE}=`))
      ?.slice(TOKEN_COOKIE.length + 1);

    if (!token) return null;

    const secret = getSecret();
    const { payload } = await jwtVerify(token, secret, {
      clockTolerance: 60,
    });

    return payload as TokenPayload;
  } catch {
    return null;
  }
}

/**
 * 验证用户已登录，返回用户信息
 * 若未登录则返回 401 响应
 */
export async function requireAuth(request: NextRequest | Request) {
  const payload = await verifyToken(request);
  if (!payload || !payload.id) {
    return {
      user: null,
      response: NextResponse.json({ error: '未登录或登录已过期' }, { status: 401 }),
    };
  }
  return {
    user: payload,
    response: null,
  };
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

  const allowedRoles = ['SUPER_ADMIN', 'AUDITOR', 'MANAGER', 'PROJECT_MANAGER'];
  if (!user?.role || !allowedRoles.includes(user.role)) {
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
  return `${TOKEN_COOKIE}=${token}; HttpOnly; ${isSecure ? 'Secure; ' : ''}SameSite=Lax; Path=/; Max-Age=86400`;
}

/**
 * 生成清除 Cookie 的响应头
 */
export function clearAuthCookie(): string {
  const isSecure = process.env.NODE_ENV === 'production';
  return `${TOKEN_COOKIE}=; HttpOnly; ${isSecure ? 'Secure; ' : ''}SameSite=Lax; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT`;
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

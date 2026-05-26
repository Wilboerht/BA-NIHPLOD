import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { verifyTokenBasic } from './lib/auth';
import { ADMIN_ROLES } from './types';

// 受保护的路径模式
const PROTECTED_PATHS = [
  '/workbench',
  '/admin',
  '/demo',
  '/api/admin',
  '/api/auth/change-password',
  '/api/auth/complete-first-login',
  '/api/auth/me',
];

// 公开路径（即使匹配到上面的前缀，也放行）
const PUBLIC_PATHS = [
  '/api/auth/login',
  '/api/auth/logout',
  '/admin/login',
];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 检查是否为公开路径
  if (PUBLIC_PATHS.some(path => pathname.startsWith(path))) {
    return NextResponse.next();
  }

  // 检查是否需要保护
  const needsProtection = PROTECTED_PATHS.some(path => pathname.startsWith(path));
  if (!needsProtection) {
    return NextResponse.next();
  }

  // 验证 JWT（不查数据库）
  const payload = await verifyTokenBasic(request);

  if (!payload) {
    // API 路由返回 401
    if (pathname.startsWith('/api/')) {
      return NextResponse.json(
        { error: '未登录或登录已过期' },
        { status: 401 }
      );
    }
    // 页面路由重定向到登录页或首页
    if (pathname.startsWith('/admin')) {
      return NextResponse.redirect(new URL('/admin/login', request.url));
    }
    return NextResponse.redirect(new URL('/', request.url));
  }

  // 检查 token 是否来自被封禁账号（新 token 会包含此字段，旧 token 在 API 层被拦截）
  if (payload.is_banned === true) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: '账号已被封禁' }, { status: 403 });
    }
    return NextResponse.redirect(new URL('/', request.url));
  }

  // 对于 /workbench 和 /admin 路由，检查是否为管理员
  if (pathname.startsWith('/workbench') || pathname.startsWith('/admin')) {
    if (!ADMIN_ROLES.includes(payload.role as typeof ADMIN_ROLES[number])) {
      if (pathname.startsWith('/api/')) {
        return NextResponse.json({ error: '无权限执行此操作' }, { status: 403 });
      }
      if (pathname.startsWith('/workbench')) {
        return NextResponse.redirect(new URL('/dealer', request.url));
      }
      return NextResponse.redirect(new URL('/', request.url));
    }
  }

  // 对于 /api/admin 路由，强制要求管理员角色（兜底防线）
  if (pathname.startsWith('/api/admin')) {
    if (!ADMIN_ROLES.includes(payload.role as typeof ADMIN_ROLES[number])) {
      return NextResponse.json({ error: '无权限执行此操作' }, { status: 403 });
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/workbench/:path*',
    '/admin/:path*',
    '/demo/:path*',
    '/api/admin/:path*',
    '/api/auth/change-password',
    '/api/auth/complete-first-login',
    '/api/auth/me',
  ],
};

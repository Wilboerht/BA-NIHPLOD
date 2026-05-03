import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { verifyToken } from './lib/auth';

// 受保护的路径模式
const PROTECTED_PATHS = [
  '/workbench',
  '/api/admin',
  '/api/auth/change-password',
  '/api/auth/complete-first-login',
  '/api/auth/me',
];

// 公开路径（即使匹配到上面的前缀，也放行）
const PUBLIC_PATHS = [
  '/api/auth/login',
  '/api/auth/logout',
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

  // 验证 JWT
  const payload = await verifyToken(request);

  if (!payload) {
    // API 路由返回 401
    if (pathname.startsWith('/api/')) {
      return NextResponse.json(
        { error: '未登录或登录已过期' },
        { status: 401 }
      );
    }
    // 页面路由重定向到首页
    return NextResponse.redirect(new URL('/', request.url));
  }

  // 对于 /workbench 路由，检查是否为管理员（DEALER 不允许访问）
  if (pathname.startsWith('/workbench')) {
    const allowedRoles = ['SUPER_ADMIN', 'AUDITOR', 'MANAGER', 'PROJECT_MANAGER'];
    if (!allowedRoles.includes(payload.role)) {
      return NextResponse.redirect(new URL('/dealer', request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/workbench/:path*',
    '/api/admin/:path*',
    '/api/auth/change-password',
    '/api/auth/complete-first-login',
    '/api/auth/me',
  ],
};

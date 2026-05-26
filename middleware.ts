import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { verifyTokenBasic } from '@/lib/auth';
import { ADMIN_ROLES } from '@/types';

// 需要管理员权限的路由前缀
const ADMIN_ROUTES = ['/workbench', '/admin'];

// 公开路由（无需认证）
const PUBLIC_ROUTES = ['/', '/verify', '/demo', '/admin/login', '/reset-password'];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 公开路由直接放行
  if (PUBLIC_ROUTES.some((route) => pathname === route || pathname.startsWith(route + '/'))) {
    return NextResponse.next();
  }

  // 静态资源直接放行
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/assets') ||
    pathname.startsWith('/uploads') ||
    pathname.startsWith('/favicon') ||
    pathname.match(/\.(?:png|jpg|jpeg|gif|webp|svg|ico|css|js|woff|woff2)$/)
  ) {
    return NextResponse.next();
  }

  // API 路由由各自 handler 做权限校验，这里仅做基本重定向
  if (pathname.startsWith('/api/')) {
    // 对匿名上传做轻量频率限制（基于 IP）
    if (pathname === '/api/upload/public') {
      // 频率限制由 API 内部处理，中间件只放行
      return NextResponse.next();
    }
    return NextResponse.next();
  }

  // 检查是否需要管理员权限
  const requiresAdmin = ADMIN_ROUTES.some((route) => pathname.startsWith(route));

  if (requiresAdmin) {
    const payload = await verifyTokenBasic(request);

    if (!payload) {
      const loginUrl = new URL('/admin/login', request.url);
      return NextResponse.redirect(loginUrl);
    }

    const isBanned = payload.is_banned === true;
    const role = payload.role as string;

    if (isBanned || !ADMIN_ROLES.includes(role as typeof ADMIN_ROLES[number])) {
      // 无权限，重定向到首页
      return NextResponse.redirect(new URL('/', request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * 匹配所有路径，排除静态文件和 API 内部处理
     * 注意：matcher 这里写 '/:path*' 即可，因为上面的代码会自己判断
     */
    '/((?!_next/static|_next/image|assets|uploads|favicon.ico).*)',
  ],
};

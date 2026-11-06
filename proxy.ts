import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { verifyTokenBasic } from './lib/auth';
import { ADMIN_ROLES } from './types';

// 受保护的路径模式
const PROTECTED_PATHS = [
  '/workbench',
  '/admin',
  '/demo',
  '/reset-password',
  '/api/admin',
  '/api/auth/change-password',
  '/api/auth/me',
];

// 仅超级管理员可访问的路径前缀
const SUPER_ADMIN_PATHS = [
  '/workbench/users',
  '/workbench/audit-logs',
  '/api/admin',
];

// 公开路径（即使匹配到上面的前缀，也放行）
const PUBLIC_PATHS = [
  '/api/auth/login',
  '/api/auth/logout',
  '/admin/login',
];

function createCsp(nonce: string): string {
  const isDev = process.env.NODE_ENV !== 'production';
  const scriptSrc = [
    "'self'",
    `'nonce-${nonce}'`,
    "'strict-dynamic'",
    'https://www.googletagmanager.com',
    'https://www.google-analytics.com',
    'https://static.cloudflareinsights.com',
    isDev ? "'unsafe-eval'" : '',
  ].filter(Boolean);
  const styleSrc = ["'self'", `'nonce-${nonce}'`, isDev ? "'unsafe-inline'" : ''].filter(Boolean);
  const connectSrc = isDev
    ? "'self' https://cloudflareinsights.com ws: wss:"
    : "'self' https://cloudflareinsights.com https://www.google-analytics.com https://*.google-analytics.com https://*.analytics.google.com https://www.googletagmanager.com";

  return [
    "default-src 'self'",
    `script-src ${scriptSrc.join(' ')}`,
    `style-src ${styleSrc.join(' ')}`,
    "style-src-attr 'unsafe-inline'",
    "img-src 'self' blob: data: https://www.google-analytics.com",
    "font-src 'self'",
    `connect-src ${connectSrc}`,
    "object-src 'none'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    isDev ? '' : 'upgrade-insecure-requests',
  ].filter(Boolean).join('; ') + ';';
}

function nextWithNonce(request: NextRequest, nonce: string): NextResponse {
  const csp = createCsp(nonce);
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', csp);

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });
  response.headers.set('Content-Security-Policy', csp);
  response.headers.set('Cache-Control', 'no-store');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  return response;
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isApi = pathname.startsWith('/api/');
  const nonce = isApi ? '' : Buffer.from(crypto.randomUUID()).toString('base64');

  // 兼容入口：在 proxy 层完成服务端 307，避免依赖页面软跳转
  if (pathname === '/verify') {
    const target = new URL('/', request.url);
    const cert = request.nextUrl.searchParams.get('cert');
    if (cert) target.searchParams.set('cert', cert);
    const redirect = NextResponse.redirect(target, 307);
    redirect.headers.set('Cache-Control', 'no-store');
    return redirect;
  }

  const nextForRequest = () => (
    isApi ? NextResponse.next() : nextWithNonce(request, nonce)
  );

  // 公开路径放行（页面仍需要 nonce/CSP）
  if (PUBLIC_PATHS.some((path) => pathname.startsWith(path))) {
    return nextForRequest();
  }

  const needsProtection = PROTECTED_PATHS.some((path) => pathname.startsWith(path));
  if (!needsProtection) {
    return nextForRequest();
  }

  const payload = await verifyTokenBasic(request);

  if (!payload) {
    if (isApi) {
      return NextResponse.json({ error: '未登录或登录已过期' }, { status: 401 });
    }
    if (pathname.startsWith('/admin')) {
      return NextResponse.redirect(new URL('/admin/login', request.url));
    }
    return NextResponse.redirect(new URL('/', request.url));
  }

  if (payload.is_banned === true) {
    if (isApi) {
      return NextResponse.json({ error: '账号已被封禁' }, { status: 403 });
    }
    return NextResponse.redirect(new URL('/', request.url));
  }

  if (
    payload.is_first_login === true
    && !pathname.startsWith('/reset-password')
    && !pathname.startsWith('/api/auth/')
  ) {
    if (isApi) {
      return NextResponse.json(
        { error: '首次登录必须修改密码', code: 'PASSWORD_CHANGE_REQUIRED' },
        { status: 403 }
      );
    }
    return NextResponse.redirect(new URL('/reset-password', request.url));
  }

  if (pathname.startsWith('/workbench') || pathname.startsWith('/admin')) {
    if (!ADMIN_ROLES.includes(payload.role as typeof ADMIN_ROLES[number])) {
      if (isApi) {
        return NextResponse.json({ error: '无权限执行此操作' }, { status: 403 });
      }
      return NextResponse.redirect(new URL('/', request.url));
    }
  }

  if (SUPER_ADMIN_PATHS.some((path) => pathname.startsWith(path))) {
    if (payload.role !== 'SUPER_ADMIN') {
      if (isApi) {
        return NextResponse.json({ error: '无权限执行此操作，仅超级管理员可操作' }, { status: 403 });
      }
      return NextResponse.redirect(new URL('/workbench', request.url));
    }
  }

  const response = nextForRequest();
  if (!isApi) {
    response.headers.set('Cache-Control', 'no-store');
    response.headers.set('X-Content-Type-Options', 'nosniff');
    response.headers.set('X-Frame-Options', 'DENY');
    response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  }
  return response;
}

export const config = {
  matcher: [
    '/',
    '/verify',
    '/reset-password',
    '/admin/:path*',
    '/workbench/:path*',
    '/demo/:path*',
    '/api/admin/:path*',
    '/api/auth/change-password',
    '/api/auth/me',
  ],
};

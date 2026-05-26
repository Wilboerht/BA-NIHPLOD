import { NextResponse } from 'next/server';

/**
 * 统一的 API 错误响应封装
 * 生产环境隐藏堆栈，开发环境返回详细错误
 */
export function apiError(
  err: unknown,
  status = 500,
  fallbackMessage = '操作失败'
): NextResponse {
  const isDev = process.env.NODE_ENV !== 'production';
  const message = err instanceof Error ? err.message : fallbackMessage;

  const body: Record<string, unknown> = { error: message };
  if (isDev && err instanceof Error && err.stack) {
    body.detail = err.stack;
  }

  return NextResponse.json(body, { status });
}

/**
 * 统一的 API 成功响应封装
 */
export function apiSuccess<T>(data: T, status = 200): NextResponse {
  return NextResponse.json({ success: true, data }, { status });
}

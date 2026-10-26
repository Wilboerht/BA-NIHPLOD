import { NextResponse } from 'next/server';

/**
 * 统一的 API 错误响应封装
 * - 生产环境只返回安全文案，避免泄露数据库/内部错误细节
 * - 开发环境返回原始错误与堆栈，便于排查
 * - 对 ValidationError 等已知错误，调用方可将安全文案作为 fallbackMessage 传入
 */
export function apiError(
  err: unknown,
  status = 500,
  fallbackMessage = '操作失败'
): NextResponse {
  const isDev = process.env.NODE_ENV !== 'production';
  const rawMessage = err instanceof Error ? err.message : fallbackMessage;

  const body: Record<string, unknown> = {
    error: isDev ? rawMessage : fallbackMessage,
  };
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

/**
 * 安全解析 JSON 请求体
 * - 解析失败或非对象结构时返回 400，而不是抛出 500
 */
export async function readJsonBody<T extends Record<string, unknown>>(
  req: Request
): Promise<{ data: T | null; response: NextResponse | null }> {
  try {
    const data = await req.json();
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      return {
        data: null,
        response: NextResponse.json({ error: '请求格式错误' }, { status: 400 }),
      };
    }
    return { data: data as T, response: null };
  } catch {
    return {
      data: null,
      response: NextResponse.json({ error: '请求格式错误' }, { status: 400 }),
    };
  }
}

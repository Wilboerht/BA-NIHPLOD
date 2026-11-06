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
 * 安全读取 multipart 请求体
 * - Content-Length 超限直接拒绝
 * - 对 chunked 请求做流式字节上限，避免 formData() 无界缓冲
 */
export async function readFormDataWithLimit(
  req: Request,
  maxBytes: number
): Promise<{ formData: FormData | null; response: NextResponse | null }> {
  const contentLength = Number(req.headers.get('content-length') || 0);
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    return {
      formData: null,
      response: NextResponse.json({ error: '请求体过大' }, { status: 413 }),
    };
  }

  if (!req.body) {
    try {
      return { formData: await req.formData(), response: null };
    } catch {
      return {
        formData: null,
        response: NextResponse.json({ error: '请求格式错误' }, { status: 400 }),
      };
    }
  }

  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => {});
        return {
          formData: null,
          response: NextResponse.json({ error: '请求体过大' }, { status: 413 }),
        };
      }
      chunks.push(value);
    }
  } catch {
    return {
      formData: null,
      response: NextResponse.json({ error: '请求读取失败' }, { status: 400 }),
    };
  }

  const body = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)), total);
  try {
    const reconstructed = new Request(req.url, {
      method: req.method,
      headers: req.headers,
      body,
    });
    return { formData: await reconstructed.formData(), response: null };
  } catch {
    return {
      formData: null,
      response: NextResponse.json({ error: '请求格式错误' }, { status: 400 }),
    };
  }
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

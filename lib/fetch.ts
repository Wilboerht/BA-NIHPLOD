/**
 * 带超时的 fetch 封装
 * 默认超时 10 秒，防止请求在网络不稳定时无限挂起
 */
export async function fetchWithTimeout(
  url: string,
  options?: RequestInit,
  timeoutMs = 10000
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return response;
  } catch (err: unknown) {
    clearTimeout(timeoutId);
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error('请求超时，请检查网络连接');
    }
    throw err;
  }
}

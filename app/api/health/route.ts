import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';

const DB_CHECK_TIMEOUT_MS = 2000;
// 健康检查结果短缓存：避免公开端点被高频请求打满数据库连接池
const RESULT_CACHE_MS = 5000;

interface HealthResult {
  ok: boolean;
  timestamp: string;
}

let cached: { value: HealthResult; expiresAt: number } | null = null;
let inFlight: Promise<HealthResult> | null = null;

async function checkDatabase(): Promise<HealthResult> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      sql`SELECT 1`,
      new Promise((_, reject) => {
        timeoutId = setTimeout(
          () => reject(new Error('database health check timeout')),
          DB_CHECK_TIMEOUT_MS
        );
      }),
    ]);

    return { ok: true, timestamp: new Date().toISOString() };
  } catch (err) {
    console.error('[health] 数据库检查失败:', err instanceof Error ? err.message : String(err));
    return { ok: false, timestamp: new Date().toISOString() };
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

function getHealth(): Promise<HealthResult> {
  if (cached && cached.expiresAt > Date.now()) {
    return Promise.resolve(cached.value);
  }
  if (!inFlight) {
    inFlight = checkDatabase()
      .then((value) => {
        cached = { value, expiresAt: Date.now() + RESULT_CACHE_MS };
        return value;
      })
      .finally(() => {
        inFlight = null;
      });
  }
  return inFlight;
}

/**
 * GET /api/health
 * 服务健康检查端点，用于部署探针和监控
 * - 数据库不可用时返回 503 degraded
 * - 结果缓存 5 秒，并发请求只会触发一次数据库检查
 */
export async function GET() {
  const result = await getHealth();
  return NextResponse.json(
    { status: result.ok ? 'ok' : 'degraded', timestamp: result.timestamp },
    {
      status: result.ok ? 200 : 503,
      headers: { 'Cache-Control': 'no-store' },
    }
  );
}

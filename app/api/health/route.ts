import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';

const DB_CHECK_TIMEOUT_MS = 2000;

/**
 * GET /api/health
 * 服务健康检查端点，用于部署探针和监控
 * - 数据库不可用时返回 503 degraded
 */
export async function GET() {
  const timestamp = new Date().toISOString();

  try {
    await Promise.race([
      sql`SELECT 1`,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('database health check timeout')), DB_CHECK_TIMEOUT_MS)
      ),
    ]);

    return NextResponse.json({ status: 'ok', timestamp });
  } catch (err) {
    console.error('[health] 数据库检查失败:', err instanceof Error ? err.message : String(err));
    return NextResponse.json({ status: 'degraded', timestamp }, { status: 503 });
  }
}

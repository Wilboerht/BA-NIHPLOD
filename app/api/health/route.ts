import { NextResponse } from 'next/server';

/**
 * GET /api/health
 * 服务健康检查端点，用于部署探针和监控
 */
export async function GET() {
  return NextResponse.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    env: process.env.NODE_ENV || 'unknown',
  });
}

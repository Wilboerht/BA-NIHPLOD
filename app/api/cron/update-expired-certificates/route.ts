import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';

/**
 * GET /api/cron/update-expired-certificates
 * 自动将已过期的 ISSUED 证书状态更新为 EXPIRED
 * 需要传入 ?secret=CRON_SECRET 进行校验
 * 建议配置外部定时任务（如 Vercel Cron、GitHub Actions 或服务器 crontab）每日调用一次
 */
export async function GET(request: Request) {
  try {
    // 兼容两种调用方式：推荐请求头 x-cron-secret，同时支持 ?secret= 查询参数
    const url = new URL(request.url);
    const secret = request.headers.get('x-cron-secret') || url.searchParams.get('secret');
    const expectedSecret = process.env.CRON_SECRET;

    if (!expectedSecret) {
      console.error('[cron] CRON_SECRET 环境变量未设置');
      return NextResponse.json(
        { error: '服务未配置定时任务密钥' },
        { status: 500 }
      );
    }

    if (secret !== expectedSecret) {
      return NextResponse.json(
        { error: '密钥校验失败' },
        { status: 401 }
      );
    }

    // 将 end_date < CURRENT_DATE 且 status = 'ISSUED' 的证书更新为 EXPIRED
    const result = await sql`
      UPDATE certificates
      SET status = 'EXPIRED', updated_at = NOW()
      WHERE status = 'ISSUED'
        AND end_date < CURRENT_DATE
      RETURNING id, cert_number
    `;

    const updatedCount = result.length;
    const updatedIds = result.map((r: Record<string, unknown>) => String(r.cert_number));

    console.log(`[cron] 自动过期证书更新完成：${updatedCount} 张证书已标记为 EXPIRED`);

    return NextResponse.json({
      success: true,
      updatedCount,
      updatedCertificates: updatedIds
    });
  } catch (err: unknown) {
    console.error('[cron] 更新过期证书失败:', err);
    const isDev = process.env.NODE_ENV !== 'production';
    const body: Record<string, unknown> = { error: '定时任务执行失败' };
    if (isDev) {
      body.detail = err instanceof Error ? err.message : String(err);
    }
    return NextResponse.json(body, { status: 500 });
  }
}

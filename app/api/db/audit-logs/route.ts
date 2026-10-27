import { NextResponse } from 'next/server';
import { getAuditLogs } from '@/lib/db';
import { requireSuperAdmin } from '@/lib/auth';

/**
 * GET /api/db/audit-logs
 * 全局审计日志查询（仅超级管理员）
 * 参数：page / pageSize / category(certificate|complaint) / q
 */
export async function GET(req: Request) {
  try {
    const { response } = await requireSuperAdmin(req);
    if (response) {
      return response;
    }

    const { searchParams } = new URL(req.url);
    const page = Math.max(parseInt(searchParams.get('page') || '1', 10) || 1, 1);
    const pageSize = Math.min(Math.max(parseInt(searchParams.get('pageSize') || '50', 10) || 1, 1), 100);

    const rawCategory = searchParams.get('category');
    const ALLOWED_CATEGORIES = ['certificate', 'complaint', 'account', 'auth', 'file', 'system'];
    const category = rawCategory && ALLOWED_CATEGORIES.includes(rawCategory) ? rawCategory : undefined;
    const q = searchParams.get('q')?.trim() || undefined;

    const { data, total, error } = await getAuditLogs(page, pageSize, category, q);

    if (error) {
      return NextResponse.json({ error: '获取审计日志失败' }, { status: 500 });
    }

    return NextResponse.json({ data: data || [], total: total || 0 });
  } catch (err: unknown) {
    console.error('[API /audit-logs] 异常:', err);
    return NextResponse.json({ error: '获取审计日志失败' }, { status: 500 });
  }
}

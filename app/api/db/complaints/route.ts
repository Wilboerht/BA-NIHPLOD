import { NextResponse } from 'next/server';
import { getAllComplaints } from '@/lib/db';
import { requireAdmin } from '@/lib/auth';

export async function GET(req: Request) {
  try {
    const { response } = await requireAdmin(req);
    if (response) {
      return response;
    }
    const { searchParams } = new URL(req.url);
    const page = Math.max(parseInt(searchParams.get('page') || '1', 10) || 1, 1);
    const pageSize = Math.min(Math.max(parseInt(searchParams.get('pageSize') || '50', 10) || 1, 1), 200);
    const rawStatus = searchParams.get('status');
    const ALLOWED_STATUS = ['PENDING', 'INVESTIGATING', 'RESOLVED', 'REJECTED', 'ALL'];
    if (rawStatus && !ALLOWED_STATUS.includes(rawStatus)) {
      return NextResponse.json({ error: '无效的状态筛选条件' }, { status: 400 });
    }
    const status = rawStatus || undefined;
    const q = searchParams.get('q')?.trim() || undefined;
    const { data, total, error } = await getAllComplaints(page, pageSize, status, q);

    if (error) {
      return NextResponse.json({ error: '获取投诉列表失败' }, { status: 500 });
    }

    return NextResponse.json({ data: data || [], total: total || 0 });
  } catch (err: unknown) {
    console.error('[API /complaints] 异常:', err);
    return NextResponse.json(
      { error: '获取投诉列表失败' },
      { status: 500 }
    );
  }
}

import { NextResponse } from 'next/server';
import { getAllComplaints } from '@/lib/db';
import { requireAdmin } from '@/lib/auth';

export async function GET(req: Request) {
  try {
    // 权限检查
    const { user, response } = await requireAdmin(req);
    if (response) {
      return response;
    }
    const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get('page') || '1', 10);
    const pageSize = Math.min(parseInt(searchParams.get('pageSize') || '50', 10), 200);
    const status = searchParams.get('status') || undefined;
    const { data, total, error } = await getAllComplaints(page, pageSize, status);

    if (error) {
      return NextResponse.json(
        { error: error.message || '获取投诉列表失败' },
        { status: 500 }
      );
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

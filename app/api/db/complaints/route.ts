import { NextResponse } from 'next/server';
import { getAllComplaints } from '@/lib/db';
import { requireAdmin } from '@/lib/auth';

export async function GET(req: Request) {
  try {
    // 权限检查
    const { response } = await requireAdmin(req);
    if (response) {
      return response;
    }

    const { data, error } = await getAllComplaints();

    if (error) {
      return NextResponse.json(
        { error: error.message || '获取投诉列表失败' },
        { status: 500 }
      );
    }

    return NextResponse.json({ data: data || [] });
  } catch (err: unknown) {
    console.error('[API] Get complaints error:', err);
    return NextResponse.json(
      { error: '获取投诉列表失败' },
      { status: 500 }
    );
  }
}

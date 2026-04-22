import { NextResponse } from 'next/server';
import { getAllComplaints } from '@/lib/db';
import { checkIsAdmin } from '@/lib/supabase-admin';

export async function GET(req: Request) {
  try {
    // 权限检查：从请求头获取管理员 ID
    const adminId = req.headers.get('x-admin-id') || '';
    const isAdmin = await checkIsAdmin(adminId);
    if (!isAdmin) {
      return NextResponse.json(
        { error: '无权访问，需要管理员权限' },
        { status: 403 }
      );
    }

    const { data, error } = await getAllComplaints();

    if (error) {
      return NextResponse.json(
        { error: error.message || '获取投诉列表失败' },
        { status: 500 }
      );
    }

    return NextResponse.json({ data: data || [] });
  } catch (err: any) {
    console.error('[API] Get complaints error:', err);
    return NextResponse.json(
      { error: err.message || '获取投诉列表失败' },
      { status: 500 }
    );
  }
}

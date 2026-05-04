import { NextResponse } from 'next/server';
import { getDashboardStats } from '@/lib/db';
import { requireAdmin } from '@/lib/auth';

export async function GET(req: Request) {
  try {
    // 权限检查：只有管理员可以查看统计数据
    const { response } = await requireAdmin(req);
    if (response) {
      return response;
    }

    const { data, error } = await getDashboardStats();

    if (error) {
      return NextResponse.json(
        { error: '获取统计数据失败' },
        { status: 500 }
      );
    }

    return NextResponse.json({ data });
  } catch (err: any) {
    console.error('[API] Get dashboard stats error:', err);
    return NextResponse.json(
      { error: '获取统计数据失败' },
      { status: 500 }
    );
  }
}

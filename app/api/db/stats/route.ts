import { NextResponse } from 'next/server';
import { getDashboardStats } from '@/lib/db';

export async function GET(req: Request) {
  try {
    const { data, error } = await getDashboardStats();

    if (error) {
      return NextResponse.json(
        { error: error.message || '获取统计数据失败' },
        { status: 500 }
      );
    }

    return NextResponse.json({ data });
  } catch (err: any) {
    console.error('[API] Get dashboard stats error:', err);
    return NextResponse.json(
      { error: err.message || '获取统计数据失败' },
      { status: 500 }
    );
  }
}

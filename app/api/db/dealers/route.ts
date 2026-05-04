import { NextResponse } from 'next/server';
import { getAllDealers } from '@/lib/db';
import { requireAdmin } from '@/lib/auth';

export async function GET(req: Request) {
  try {
    // 权限检查：只有管理员可以查看经销商列表
    const { response } = await requireAdmin(req);
    if (response) {
      return response;
    }

    const { data, error } = await getAllDealers();

    if (error) {
      return NextResponse.json(
        { error: '获取经销商列表失败' },
        { status: 500 }
      );
    }

    return NextResponse.json({ data: data || [] });
  } catch (err: unknown) {
    console.error('[API] Get dealers error:', err);
    return NextResponse.json(
      { error: '获取经销商列表失败' },
      { status: 500 }
    );
  }
}

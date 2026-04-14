import { NextResponse } from 'next/server';
import { getAllDealers } from '@/lib/db';

export async function GET(req: Request) {
  try {
    const { data, error } = await getAllDealers();

    if (error) {
      return NextResponse.json(
        { error: error.message || '获取经销商列表失败' },
        { status: 500 }
      );
    }

    return NextResponse.json({ data: data || [] });
  } catch (err: any) {
    console.error('[API] Get dealers error:', err);
    return NextResponse.json(
      { error: err.message || '获取经销商列表失败' },
      { status: 500 }
    );
  }
}

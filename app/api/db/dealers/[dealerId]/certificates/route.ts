import { NextResponse } from 'next/server';
import { getCertificatesByDealerId, getDealerById } from '@/lib/db';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ dealerId: string }> }
) {
  try {
    const { dealerId } = await params;

    if (!dealerId) {
      return NextResponse.json(
        { error: 'dealerId is required' },
        { status: 400 }
      );
    }

    // 验证经销商存在
    const dealerCheck = await getDealerById(dealerId);
    if (!dealerCheck.data) {
      return NextResponse.json(
        { error: '经销商不存在' },
        { status: 404 }
      );
    }

    // 获取证书列表
    const { data, error } = await getCertificatesByDealerId(dealerId);

    if (error) {
      return NextResponse.json(
        { error: error.message || '获取证书列表失败' },
        { status: 500 }
      );
    }

    return NextResponse.json({ data: data || [] });
  } catch (err: any) {
    console.error('[API] Get dealer certificates error:', err);
    return NextResponse.json(
      { error: err.message || '获取证书列表失败' },
      { status: 500 }
    );
  }
}

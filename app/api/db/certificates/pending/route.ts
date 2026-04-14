import { NextResponse } from 'next/server';
import { getPendingCertificates } from '@/lib/db';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const limit = searchParams.get('limit');

    const { data, error } = await getPendingCertificates(
      limit ? parseInt(limit) : undefined
    );

    if (error) {
      return NextResponse.json(
        { error: error.message || '获取待核发证书失败' },
        { status: 500 }
      );
    }

    return NextResponse.json({ data: data || [] });
  } catch (err: any) {
    console.error('[API] Get pending certificates error:', err);
    return NextResponse.json(
      { error: err.message || '获取待核发证书失败' },
      { status: 500 }
    );
  }
}

import { NextResponse } from 'next/server';
import { getDealersByProfileId } from '@/lib/db';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ profileId: string }> }
) {
  try {
    const { profileId } = await params;

    if (!profileId) {
      return NextResponse.json(
        { error: 'profileId is required' },
        { status: 400 }
      );
    }

    const { data, error } = await getDealersByProfileId(profileId);

    if (error) {
      return NextResponse.json(
        { error: error.message || '获取经销商信息失败' },
        { status: 500 }
      );
    }

    return NextResponse.json({ data: data || [] });
  } catch (err: any) {
    console.error('[API] Get dealers by profile error:', err);
    return NextResponse.json(
      { error: err.message || '获取经销商信息失败' },
      { status: 500 }
    );
  }
}

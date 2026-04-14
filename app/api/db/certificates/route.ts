import { NextRequest, NextResponse } from 'next/server';
import { getAllCertificates } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const limit = request.nextUrl.searchParams.get('limit');
    const limitNum = limit ? parseInt(limit) : undefined;

    const { data, error } = await getAllCertificates(limitNum);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data });
  } catch (err) {
    console.error('[API] Get all certificates error:', err);
    return NextResponse.json(
      { error: 'Failed to fetch certificates' },
      { status: 500 }
    );
  }
}

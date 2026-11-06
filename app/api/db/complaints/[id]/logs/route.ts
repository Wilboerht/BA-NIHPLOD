import { NextResponse } from 'next/server';
import { getComplaintAuditLogs } from '@/lib/db';
import { requireAdmin } from '@/lib/auth';
import { isUuid } from '@/lib/validation';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    if (!isUuid(id)) {
      return NextResponse.json({ error: '工单 ID 格式无效' }, { status: 400 });
    }

    // 权限检查
    const { response } = await requireAdmin(req);
    if (response) {
      return response;
    }

    const { data, error } = await getComplaintAuditLogs(id);

    if (error) {
      return NextResponse.json({ error: '获取审计日志失败' }, { status: 500 });
    }

    return NextResponse.json({ data: data || [] });
  } catch (err: unknown) {
    console.error('[API] Get complaint logs error:', err);
    return NextResponse.json(
      { error: '获取审计日志失败' },
      { status: 500 }
    );
  }
}

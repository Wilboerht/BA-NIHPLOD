import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { requireAdmin } from '@/lib/auth';

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { status, review_note } = await req.json();

    if (!id || !status) {
      return NextResponse.json(
        { error: '缺少必要参数' },
        { status: 400 }
      );
    }

    // 权限检查
    const { user, response } = await requireAdmin(req);
    if (response) {
      return response;
    }

    // 更新投诉状态
    try {
      await sql`
        UPDATE complaints 
        SET status = ${status},
            review_note = ${review_note || null},
            handler_id = ${user!.id},
            updated_at = NOW()
        WHERE id = ${id}
      `;
      console.log('[complaints-update] 投诉已更新');
      return NextResponse.json({ success: true });
    } catch (err: unknown) {
      console.error('[complaints-update] 数据库错误:', err);
      return NextResponse.json(
        { error: '操作失败' },
        { status: 500 }
      );
    }
  } catch (err: unknown) {
    console.error('[complaints-update] API 错误:', err);
    return NextResponse.json(
      { error: '操作失败' },
      { status: 500 }
    );
  }
}

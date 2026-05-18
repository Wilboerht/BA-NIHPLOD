import { NextResponse } from 'next/server';
import { sql, createComplaintAuditLog, deleteComplaint } from '@/lib/db';
import { requireAdmin } from '@/lib/auth';

// 合法的状态流转图
const VALID_STATUS_TRANSITIONS: Record<string, string[]> = {
  'PENDING': ['INVESTIGATING', 'RESOLVED', 'REJECTED'],
  'INVESTIGATING': ['RESOLVED', 'REJECTED'],
  'RESOLVED': [], // 终态
  'REJECTED': [], // 终态
};

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

    // 审核备注长度校验
    if (review_note && review_note.length > 2000) {
      return NextResponse.json(
        { error: '审核备注不能超过 2000 字' },
        { status: 400 }
      );
    }

    // 权限检查
    const { user, response } = await requireAdmin(req);
    if (response) {
      return response;
    }

    // 查询当前状态
    const currentRows = await sql`SELECT status FROM complaints WHERE id = ${id} LIMIT 1`;
    if (currentRows.length === 0) {
      return NextResponse.json({ error: '工单不存在' }, { status: 404 });
    }
    const currentStatus = currentRows[0].status;

    // 状态流转校验
    const allowedNextStatuses = VALID_STATUS_TRANSITIONS[currentStatus] || [];
    if (!allowedNextStatuses.includes(status)) {
      return NextResponse.json(
        { error: `状态流转不合法：${currentStatus} → ${status}` },
        { status: 400 }
      );
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

      // 记录审计日志
      await createComplaintAuditLog(
        id,
        user!.id,
        `STATUS_CHANGE:${currentStatus}->${status}`,
        review_note || undefined
      );

      console.log('[complaints-update] 投诉已更新');
      return NextResponse.json({ success: true });
    } catch (err: unknown) {
      console.error('[complaints-update] 数据库错误:', err);
      const errorMessage = err instanceof Error ? err.message : String(err);
      const isDev = process.env.NODE_ENV !== 'production';
      return NextResponse.json(
        { error: '操作失败', detail: isDev ? errorMessage : undefined },
        { status: 500 }
      );
    }
  } catch (err: unknown) {
    console.error('[complaints-update] API 错误:', err);
    const errorMessage = err instanceof Error ? err.message : String(err);
    const isDev = process.env.NODE_ENV !== 'production';
    return NextResponse.json(
      { error: '操作失败', detail: isDev ? errorMessage : undefined },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/db/complaints/:id
 * 删除投诉工单（仅限管理员）
 */
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    if (!id) {
      return NextResponse.json({ error: '缺少必要参数' }, { status: 400 });
    }

    const { user, response } = await requireAdmin(req);
    if (response) {
      return response;
    }

    const { success, error } = await deleteComplaint(id);
    if (!success) {
      return NextResponse.json(
        { error: error?.message || '删除失败' },
        { status: 500 }
      );
    }

    // 记录审计日志
    await createComplaintAuditLog(id, user!.id, 'DELETED', '管理员删除工单');

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    console.error('[complaints-delete] API 错误:', err);
    return NextResponse.json({ error: '删除失败' }, { status: 500 });
  }
}

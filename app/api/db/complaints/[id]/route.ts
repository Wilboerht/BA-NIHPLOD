import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { requireAdmin, requireSuperAdmin } from '@/lib/auth';
import { readJsonBody } from '@/lib/api-utils';
import { actorFromUser, writeAudit } from '@/lib/audit';

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
    const { data: body, response: bodyError } = await readJsonBody<{
      status?: string;
      review_note?: string;
    }>(req);
    if (bodyError) return bodyError;

    const { status, review_note } = body!;

    if (!id || !status || typeof status !== 'string') {
      return NextResponse.json(
        { error: '缺少必要参数' },
        { status: 400 }
      );
    }

    if (review_note !== undefined && review_note !== null && typeof review_note !== 'string') {
      return NextResponse.json(
        { error: '审核备注格式无效' },
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

    // 查询当前状态（软删除工单不可再流转）
    const currentRows = await sql`
      SELECT status
      FROM complaints
      WHERE id = ${id}
        AND deleted_at IS NULL
      LIMIT 1
    `;
    if (currentRows.length === 0) {
      return NextResponse.json({ error: '工单不存在' }, { status: 404 });
    }
    const currentStatus = String(currentRows[0].status);

    // 状态流转校验
    const allowedNextStatuses = VALID_STATUS_TRANSITIONS[currentStatus] || [];
    if (!allowedNextStatuses.includes(status)) {
      return NextResponse.json(
        { error: `状态流转不合法：${currentStatus} → ${status}` },
        { status: 400 }
      );
    }

    // 更新投诉状态与审计日志在同一事务中
    try {
      await sql.begin(async (tx) => {
        const updateResult = await tx`
          UPDATE complaints 
          SET status = ${status},
              review_note = ${review_note || null},
              handler_id = ${user!.id},
              updated_at = NOW()
          WHERE id = ${id}
            AND deleted_at IS NULL
          RETURNING id
        `;
        if (!updateResult || updateResult.length === 0) {
          throw new Error('工单不存在或已被删除');
        }

        await writeAudit(tx, {
          actor: actorFromUser(user),
          action: `STATUS_CHANGE:${currentStatus}->${status}`,
          targetType: 'complaint',
          targetId: id,
          complaintId: id,
          complaintRef: id,
          before: { status: currentStatus },
          after: { status, review_note: review_note || null },
          comment: review_note || null,
          reason: review_note || null,
          request: req,
        });
      });

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
 * 软删除投诉工单（仅限超级管理员；证据与审计保留）
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

    const { user, response } = await requireSuperAdmin(req);
    if (response) {
      return response;
    }

    await sql.begin(async (tx) => {
      const beforeRows = await tx`
        SELECT id, status
        FROM complaints
        WHERE id = ${id}
          AND deleted_at IS NULL
        LIMIT 1
      `;
      if (!beforeRows || beforeRows.length === 0) {
        throw new Error('COMPLAINT_NOT_FOUND');
      }

      const updateResult = await tx`
        UPDATE complaints
        SET deleted_at = NOW(), deleted_by = ${user!.id}, updated_at = NOW()
        WHERE id = ${id}
          AND deleted_at IS NULL
        RETURNING id
      `;
      if (!updateResult || updateResult.length === 0) {
        throw new Error('COMPLAINT_NOT_FOUND');
      }

      await writeAudit(tx, {
        actor: actorFromUser(user),
        action: 'DELETE_COMPLAINT',
        targetType: 'complaint',
        targetId: id,
        complaintId: id,
        complaintRef: id,
        before: { status: beforeRows[0].status },
        after: { deleted_at: new Date().toISOString(), deleted_by: user!.id },
        comment: '管理员软删除投诉工单（证据与审计保留）',
        reason: 'soft_delete',
        request: req,
      });
    });

    return NextResponse.json({ success: true, message: '工单已移除（软删除，证据与审计保留）' });
  } catch (err: unknown) {
    console.error('[complaints-delete] API 错误:', err);
    if (err instanceof Error && err.message === 'COMPLAINT_NOT_FOUND') {
      return NextResponse.json({ error: '工单不存在或已被移除' }, { status: 404 });
    }
    return NextResponse.json({ error: '删除失败' }, { status: 500 });
  }
}

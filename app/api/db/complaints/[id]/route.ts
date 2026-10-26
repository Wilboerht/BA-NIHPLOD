import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { requireAdmin } from '@/lib/auth';
import { readJsonBody } from '@/lib/api-utils';
import { deletePublicUpload } from '@/lib/storage';

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
          RETURNING id
        `;
        if (!updateResult || updateResult.length === 0) {
          throw new Error('工单不存在或已被删除');
        }

        await tx`
          INSERT INTO audit_logs (complaint_id, actor_id, action, comment, created_at)
          VALUES (${id}, ${user!.id}, ${`STATUS_CHANGE:${currentStatus}->${status}`}, ${review_note || null}, NOW())
        `;
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

    // 先查询关联的媒体文件路径
    const complaintRows = await sql`
      SELECT evidence_image_url, evidence_image_urls
      FROM complaints WHERE id = ${id} LIMIT 1
    `;
    const imageUrls: string[] = [];
    if (complaintRows.length > 0) {
      const row = complaintRows[0];
      if (Array.isArray(row.evidence_image_urls)) {
        imageUrls.push(...row.evidence_image_urls);
      }
      if (row.evidence_image_url && typeof row.evidence_image_url === 'string') {
        if (!imageUrls.includes(row.evidence_image_url)) {
          imageUrls.push(row.evidence_image_url);
        }
      }
    }

    // 先写审计日志，再删除工单：
    // complaint_id 外键为 ON DELETE SET NULL，删除后日志保留 complaint_ref 以便追溯
    await sql.begin(async (tx) => {
      const exists = await tx`SELECT id FROM complaints WHERE id = ${id} LIMIT 1`;
      if (!exists || exists.length === 0) {
        throw new Error('工单不存在或已被删除');
      }
      await tx`
        INSERT INTO audit_logs (complaint_id, complaint_ref, actor_id, action, comment, created_at)
        VALUES (${id}, ${id}, ${user!.id}, 'DELETED', '管理员删除工单', NOW())
      `;
      await tx`DELETE FROM complaints WHERE id = ${id}`;
    });

    // 数据库删除成功后，清理关联的媒体文件
    if (imageUrls.length > 0) {
      for (const url of imageUrls) {
        const { error } = await deletePublicUpload(url);
        if (error) {
          console.error(`[complaints-delete] 删除媒体文件失败: ${url}`, error);
        }
      }
    }

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    console.error('[complaints-delete] API 错误:', err);
    return NextResponse.json({ error: '删除失败' }, { status: 500 });
  }
}

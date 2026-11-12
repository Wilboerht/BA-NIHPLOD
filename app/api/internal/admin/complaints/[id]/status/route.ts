import { NextResponse } from "next/server";
import { z } from "zod";
import { sql } from "@/lib/db";
import { authenticateInternalApi } from "@/lib/internal-auth";
import { writeAudit } from "@/lib/audit";
import { canTransitionComplaintStatus } from "@/lib/complaint-status";
import { isUuid } from "@/lib/validation";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

const bodySchema = z
  .object({
    status: z.enum(["INVESTIGATING", "RESOLVED", "REJECTED"]).optional(),
    review_note: z.string().max(2000).optional(),
    actor: z.object({
      id: z.string().min(1).max(64),
      email: z.string().max(255).optional().default(""),
      name: z.string().max(100).optional().default(""),
      role: z.string().max(50).optional().default(""),
    }),
  })
  .refine((data) => data.status !== undefined || data.review_note !== undefined, {
    message: "至少提供 status 或 review_note",
  });

// POST /api/internal/admin/complaints/[id]/status
// 主站 BFF 回写举报状态/审核备注；BA 仍保留完整状态机与审计。
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const path = `/api/internal/admin/complaints/${id}/status`;
  const auth = await authenticateInternalApi(request, path, "POST", ["ba"]);
  if (!auth.ok) return auth.response;

  if (!isUuid(id)) {
    return NextResponse.json(
      { success: false, error: { code: "INVALID_ID", message: "举报 ID 无效" } },
      { status: 400 }
    );
  }

  let parsed;
  try {
    parsed = bodySchema.safeParse(JSON.parse(auth.bodyText));
  } catch {
    return NextResponse.json(
      { success: false, error: { code: "INVALID_JSON", message: "请求体不是合法 JSON" } },
      { status: 400 }
    );
  }
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: { code: "INVALID_PARAMS", message: "状态或审核备注无效" } },
      { status: 400 }
    );
  }

  const { status, review_note, actor } = parsed.data;
  const hasReviewNote = review_note !== undefined;

  try {
    const result = await sql.begin(async (tx) => {
      const currentRows = await tx`
        SELECT status, review_note
        FROM complaints
        WHERE id = ${id} AND deleted_at IS NULL
        LIMIT 1
      `;
      if (currentRows.length === 0) {
        return { kind: "not_found" as const };
      }
      const currentStatus = String(currentRows[0].status);
      const currentReviewNote =
        currentRows[0].review_note == null ? null : String(currentRows[0].review_note);
      const nextStatus = status ?? currentStatus;
      const nextReviewNote = hasReviewNote ? review_note?.trim() || null : currentReviewNote;

      if (status !== undefined) {
        if (status === currentStatus) {
          return { kind: "invalid" as const, message: "状态未变化" };
        }
        if (!canTransitionComplaintStatus(currentStatus, status)) {
          return {
            kind: "invalid" as const,
            message: `状态流转不合法：${currentStatus} → ${status}`,
          };
        }
      }

      const shadowRows = await tx`
        SELECT id, full_name, username
        FROM profiles
        WHERE external_admin_id = ${actor.id} AND deleted_at IS NULL
        LIMIT 1
      `;
      const handlerId = shadowRows[0]?.id ?? null;
      const handlerName =
        actor.name || (shadowRows[0]?.full_name as string | undefined) || actor.email || null;

      const updated = await tx`
        UPDATE complaints
        SET status = ${nextStatus},
            review_note = ${nextReviewNote},
            handler_id = ${handlerId},
            handled_by_external_admin_id = ${actor.id},
            handled_by_name = ${handlerName},
            handled_by_email = ${actor.email || null},
            updated_at = NOW()
        WHERE id = ${id}
          AND deleted_at IS NULL
          AND status = ${currentStatus}
        RETURNING id, status, review_note
      `;
      if (updated.length === 0) {
        return { kind: "conflict" as const };
      }

      const statusChanged = nextStatus !== currentStatus;
      await writeAudit(tx, {
        actor: {
          id: handlerId,
          role: actor.role || null,
          name: handlerName,
          source: "main",
          externalId: actor.id,
        },
        action: statusChanged
          ? `STATUS_CHANGE:${currentStatus}->${nextStatus}`
          : "REVIEW_NOTE_UPDATE",
        targetType: "complaint",
        targetId: id,
        complaintId: id,
        complaintRef: id,
        before: { status: currentStatus, review_note: currentReviewNote },
        after: { status: nextStatus, review_note: nextReviewNote },
        comment: nextReviewNote,
        reason: nextReviewNote,
        request,
      });

      return {
        kind: "ok" as const,
        data: {
          id: String(updated[0].id),
          status: String(updated[0].status),
          reviewNote: updated[0].review_note ? String(updated[0].review_note) : null,
          handledBy: handlerName,
        },
      };
    });

    if (result.kind === "not_found") {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "举报不存在" } },
        { status: 404 }
      );
    }
    if (result.kind === "conflict") {
      return NextResponse.json(
        { success: false, error: { code: "STATUS_CONFLICT", message: "举报状态已变化，请刷新后重试" } },
        { status: 409 }
      );
    }
    if (result.kind === "invalid") {
      return NextResponse.json(
        { success: false, error: { code: "INVALID_TRANSITION", message: result.message } },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { success: true, data: result.data },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    logger.error("[InternalComplaints] status update failed", { error: String(error) });
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "更新举报失败" } },
      { status: 500 }
    );
  }
}

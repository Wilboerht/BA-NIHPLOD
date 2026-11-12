import { NextResponse } from "next/server";
import { z } from "zod";
import { sql } from "@/lib/db";
import { authenticateInternalApi } from "@/lib/internal-auth";
import { writeAudit } from "@/lib/audit";
import { isUuid } from "@/lib/validation";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  actor: z.object({
    id: z.string().min(1).max(64),
    email: z.string().max(255).optional().default(""),
    name: z.string().max(100).optional().default(""),
    role: z.string().max(50).optional().default(""),
  }),
});

// POST /api/internal/admin/complaints/[id]/delete
// 主站 BFF 软删除举报；证据与审计保留。
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const path = `/api/internal/admin/complaints/${id}/delete`;
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
      { success: false, error: { code: "INVALID_PARAMS", message: "操作人信息无效" } },
      { status: 400 }
    );
  }

  const { actor } = parsed.data;

  try {
    const result = await sql.begin(async (tx) => {
      const currentRows = await tx`
        SELECT id, status
        FROM complaints
        WHERE id = ${id} AND deleted_at IS NULL
        LIMIT 1
      `;
      if (currentRows.length === 0) {
        return { kind: "not_found" as const };
      }

      const shadowRows = await tx`
        SELECT id, full_name, username
        FROM profiles
        WHERE external_admin_id = ${actor.id} AND deleted_at IS NULL
        LIMIT 1
      `;
      const deletedBy = shadowRows[0]?.id ?? null;
      const actorName =
        actor.name || (shadowRows[0]?.full_name as string | undefined) || actor.email || null;

      const updated = await tx`
        UPDATE complaints
        SET deleted_at = NOW(),
            deleted_by = ${deletedBy},
            handler_id = COALESCE(${deletedBy}, handler_id),
            handled_by_external_admin_id = ${actor.id},
            handled_by_name = ${actorName},
            handled_by_email = ${actor.email || null},
            updated_at = NOW()
        WHERE id = ${id} AND deleted_at IS NULL
        RETURNING id
      `;
      if (updated.length === 0) {
        return { kind: "not_found" as const };
      }

      await writeAudit(tx, {
        actor: {
          id: deletedBy,
          role: actor.role || null,
          name: actorName,
          source: "main",
          externalId: actor.id,
        },
        action: "DELETE_COMPLAINT",
        targetType: "complaint",
        targetId: id,
        complaintId: id,
        complaintRef: id,
        before: { status: currentRows[0].status },
        after: { deleted_at: new Date().toISOString(), deleted_by: deletedBy },
        comment: "主站管理员软删除举报（证据与审计保留）",
        reason: "soft_delete",
        request,
      });

      return { kind: "ok" as const, id: String(updated[0].id) };
    });

    if (result.kind === "not_found") {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "举报不存在或已删除" } },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { success: true, data: { id: result.id } },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    logger.error("[InternalComplaints] delete failed", { error: String(error) });
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "删除举报失败" } },
      { status: 500 }
    );
  }
}

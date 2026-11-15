import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { authenticateInternalApi } from "@/lib/internal-auth";
import { readInternalActorFromRequest } from "@/lib/internal-actor";
import { writeAudit } from "@/lib/audit";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

const REVOKE_PATH = "/api/internal/admin/session/revoke";

/**
 * POST /api/internal/admin/session/revoke?externalAdminId=...
 * 主站管理员登出时撤销对应 BA 影子账号的本地会话。
 */
export async function POST(request: Request) {
  const auth = await authenticateInternalApi(request, REVOKE_PATH, "POST", ["ba"], 1024 * 1024, {
    requireActor: true,
  });
  if (!auth.ok) return auth.response;
  const actor = readInternalActorFromRequest(request);
  if (!actor) {
    return NextResponse.json(
      { success: false, error: { code: "ACTOR_REQUIRED", message: "缺少内部操作人身份" } },
      { status: 401 }
    );
  }

  const externalAdminId = new URL(request.url).searchParams.get("externalAdminId") || "";
  if (!externalAdminId || externalAdminId.length > 64) {
    return NextResponse.json(
      { success: false, error: { code: "INVALID_PARAMS", message: "缺少管理员 ID" } },
      { status: 400 }
    );
  }
  if (externalAdminId !== actor.externalAdminId) {
    return NextResponse.json(
      { success: false, error: { code: "FORBIDDEN", message: "只能撤销当前管理员的会话" } },
      { status: 403 }
    );
  }

  try {
    const rows = await sql`
      UPDATE profiles
      SET token_version = token_version + 1,
          last_synced_at = NOW(),
          updated_at = NOW()
      WHERE external_admin_id = ${externalAdminId}
        AND deleted_at IS NULL
      RETURNING id, token_version
    `;
    if (rows.length > 0) {
      await writeAudit(sql, {
        actor: {
          id: String(rows[0].id),
          role: actor.baRole ?? null,
          name: actor.name || actor.email || "主站管理员",
          source: "main",
          externalId: actor.externalAdminId,
        },
        action: "ADMIN_SSO_LOGOUT_REVOKE",
        targetType: "profile",
        targetId: String(rows[0].id),
        comment: "主站管理员登出，撤销 BA 本地会话",
        request,
      }).catch(() => {});
    }
    return NextResponse.json({
      success: true,
      data: { revoked: rows.length > 0, tokenVersion: rows[0]?.token_version ?? null },
    });
  } catch (error) {
    logger.error("[InternalAdminSessionRevoke] failed", { error: String(error) });
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "撤销 BA 会话失败" } },
      { status: 500 }
    );
  }
}


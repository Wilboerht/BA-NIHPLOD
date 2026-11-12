import crypto from "crypto";
import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { z } from "zod";
import { sql } from "@/lib/db";
import { authenticateInternalApi } from "@/lib/internal-auth";
import { writeAudit } from "@/lib/audit";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

const RESET_PATH = "/api/internal/admin/emergency-account/reset-password";

const bodySchema = z.object({
  actor: z.object({
    id: z.string().min(1).max(64),
    email: z.string().max(255).optional().default(""),
    name: z.string().max(100).optional().default(""),
    role: z.string().max(50).optional().default(""),
  }),
});

interface ResetOk {
  kind: "ok";
  tokenVersion: number;
}

interface ResetNotFound {
  kind: "not_found";
}

interface ResetNotLocal {
  kind: "not_local";
}

function jsonError(code: string, message: string, status: number): NextResponse {
  return NextResponse.json(
    { success: false, error: { code, message } },
    { status, headers: { "Cache-Control": "no-store" } }
  );
}

// POST /api/internal/admin/emergency-account/reset-password
// 主站超级管理员重置 BA 应急账号密码；新密码只返回一次，不落库明文。
export async function POST(request: Request) {
  const auth = await authenticateInternalApi(request, RESET_PATH, "POST", ["ba"]);
  if (!auth.ok) return auth.response;

  let parsed: z.infer<typeof bodySchema>;
  try {
    const result = bodySchema.safeParse(JSON.parse(auth.bodyText));
    if (!result.success) return jsonError("INVALID_PARAMS", "请求参数无效", 400);
    parsed = result.data;
  } catch {
    return jsonError("INVALID_JSON", "请求体不是合法 JSON", 400);
  }

  const { actor } = parsed;
  const username = (process.env.BA_BREAK_GLASS_USERNAME || "ba-emergency").trim();
  const password = crypto.randomBytes(18).toString("base64url");

  try {
    const passwordHash = await bcrypt.hash(password, 12);
    const result = await sql.begin(async (tx): Promise<ResetOk | ResetNotFound | ResetNotLocal> => {
      const rows = await tx`
        SELECT id, username, auth_source, token_version
        FROM profiles
        WHERE username = ${username}
        FOR UPDATE
      `;
      if (rows.length === 0) return { kind: "not_found" };
      if (String(rows[0].auth_source) !== "local") return { kind: "not_local" };

      const nextVersion = Number(rows[0].token_version) + 1;
      await tx`
        UPDATE profiles
        SET password_hash = ${passwordHash},
            role = 'SUPER_ADMIN',
            is_first_login = FALSE,
            is_banned = FALSE,
            deleted_at = NULL,
            auth_source = 'local',
            external_admin_id = NULL,
            external_role = NULL,
            external_token_version = NULL,
            main_totp_enabled = FALSE,
            token_version = ${nextVersion},
            updated_at = NOW()
        WHERE id = ${rows[0].id}
      `;

      await writeAudit(tx, {
        actor: {
          id: null,
          role: actor.role || null,
          name: actor.name || actor.email || "主站管理员",
          source: "main",
          externalId: actor.id,
        },
        action: "RESET_EMERGENCY_PASSWORD",
        targetType: "profile",
        targetId: String(rows[0].id),
        targetRef: username,
        comment: "主站管理员重置 BA 应急账号密码",
        after: { tokenVersion: nextVersion },
        request,
      });

      return { kind: "ok", tokenVersion: nextVersion };
    });

    if (result.kind === "not_found") {
      return jsonError("EMERGENCY_ACCOUNT_NOT_FOUND", "应急账号不存在", 404);
    }
    if (result.kind === "not_local") {
      return jsonError("EMERGENCY_ACCOUNT_NOT_LOCAL", "应急账号不是本地账号，拒绝重置", 409);
    }

    return NextResponse.json(
      {
        success: true,
        data: {
          username,
          password,
          tokenVersion: result.tokenVersion,
        },
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    logger.error("[InternalEmergencyAccount] reset failed", { error: String(error) });
    return jsonError("INTERNAL_ERROR", "重置应急密码失败", 500);
  }
}

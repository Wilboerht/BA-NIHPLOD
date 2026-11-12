import crypto from "crypto";
import { NextResponse } from "next/server";
import {
  AdminSsoError,
  fetchMainAdminStatuses,
  getAdminSsoConfig,
  type MainAdminStatus,
} from "@/lib/admin-sso";
import { sql } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

const BATCH_SIZE = 100;

function authorized(request: Request): boolean {
  const provided = request.headers.get("x-cron-secret") || "";
  const expected = process.env.CRON_SECRET || "";
  if (!expected) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function resolveStatusRole(status: MainAdminStatus): "SUPER_ADMIN" | "AUDITOR" | null {
  const permissions = Array.isArray(status.permissions) ? status.permissions : [];
  const role = status.baRole || status.clientRole;
  if (role === "super_admin" && (status.role === "owner" || permissions.includes("ba:admin"))) {
    return "SUPER_ADMIN";
  }
  if (role === "auditor" && permissions.includes("ba:access")) {
    return "AUDITOR";
  }
  return null;
}

// GET /api/cron/admin-sso-sync
// 每 5 分钟同步 BA 影子管理员状态/角色/版本；角色或版本变化时撤销本地会话。
export async function GET(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (process.env.ADMIN_SSO_ENABLED !== "true") {
    return NextResponse.json({ success: true, skipped: true, reason: "sso_disabled" });
  }

  let config: ReturnType<typeof getAdminSsoConfig>;
  try {
    config = getAdminSsoConfig();
  } catch (error) {
    logger.error("[AdminSSOSync] 配置缺失", { error: String(error) });
    return NextResponse.json(
      { success: false, error: "Admin SSO is not configured" },
      { status: 500 }
    );
  }

  const shadowAdmins = await sql`
    SELECT id, external_admin_id, external_token_version, external_role, role,
           is_banned, main_totp_enabled
    FROM profiles
    WHERE auth_source = 'sso'
      AND external_admin_id IS NOT NULL
      AND deleted_at IS NULL
    ORDER BY id ASC
  `;

  if (shadowAdmins.length === 0) {
    return NextResponse.json({ success: true, checked: 0, updated: 0, revoked: 0 });
  }

  let updated = 0;
  let revoked = 0;

  try {
    for (let offset = 0; offset < shadowAdmins.length; offset += BATCH_SIZE) {
      const batch = shadowAdmins.slice(offset, offset + BATCH_SIZE);
      const ids = batch
        .map((row: Record<string, unknown>) => row.external_admin_id)
        .filter((id): id is string => typeof id === "string" && id.length > 0);
      const statuses = await fetchMainAdminStatuses(ids, config);
      const statusById = new Map(statuses.map((status) => [status.id, status]));

      for (const shadow of batch) {
        const externalId = String(shadow.external_admin_id);
        const status = statusById.get(externalId);
        const localRole = status ? resolveStatusRole(status) : null;

        if (!status || status.status !== "ACTIVE" || Boolean(status.deletedAt) || !localRole) {
          if (!shadow.is_banned) {
            await sql`
              UPDATE profiles
              SET is_banned = TRUE,
                  token_version = token_version + 1,
                  last_synced_at = NOW(),
                  updated_at = NOW()
              WHERE id = ${shadow.id} AND deleted_at IS NULL
            `;
            revoked += 1;
            await writeAudit(sql, {
              actor: { source: "system" },
              action: "ADMIN_SSO_SYNC_REVOKE",
              targetType: "profile",
              targetId: String(shadow.id),
              comment: "主站管理员被禁用/删除或无 BA 权限，撤销本地会话",
              reason: !status ? "not_found" : "inactive_or_no_access",
              request,
              after: { externalAdminId: externalId },
            }).catch(() => {});
          } else {
            await sql`
              UPDATE profiles SET last_synced_at = NOW() WHERE id = ${shadow.id}
            `;
          }
          continue;
        }

        const versionChanged =
          shadow.external_token_version === null ||
          Number(shadow.external_token_version) !== status.ver;
        const roleChanged = shadow.role !== localRole;
        const externalRoleChanged = shadow.external_role !== status.role;
        const totpChanged = Boolean(shadow.main_totp_enabled) !== Boolean(status.totpEnabled);
        const bannedChanged = Boolean(shadow.is_banned);

        if (versionChanged || roleChanged || externalRoleChanged || totpChanged || bannedChanged) {
          await sql`
            UPDATE profiles
            SET role = ${localRole},
                is_banned = FALSE,
                is_first_login = FALSE,
                external_token_version = ${status.ver},
                external_role = ${status.role},
                main_totp_enabled = ${status.totpEnabled},
                token_version = token_version + 1,
                last_synced_at = NOW(),
                updated_at = NOW()
            WHERE id = ${shadow.id} AND deleted_at IS NULL
          `;
          updated += 1;
          if (versionChanged || roleChanged || bannedChanged) revoked += 1;
          await writeAudit(sql, {
            actor: { source: "system" },
            action: "ADMIN_SSO_SYNC_UPDATE",
            targetType: "profile",
            targetId: String(shadow.id),
            comment: "同步主站管理员角色/状态",
            request,
            after: {
              externalAdminId: externalId,
              role: localRole,
              externalRole: status.role,
              version: status.ver,
              totpEnabled: status.totpEnabled,
            },
          }).catch(() => {});
        } else {
          await sql`
            UPDATE profiles SET last_synced_at = NOW() WHERE id = ${shadow.id}
          `;
        }
      }
    }
  } catch (error) {
    if (error instanceof AdminSsoError) {
      logger.error("[AdminSSOSync] 主站状态接口失败", {
        code: error.code,
        message: error.message,
      });
      return NextResponse.json(
        { success: false, error: "主站状态同步失败", code: error.code },
        { status: 502 }
      );
    }
    logger.error("[AdminSSOSync] sync failed", { error: String(error) });
    return NextResponse.json({ success: false, error: "同步失败" }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    checked: shadowAdmins.length,
    updated,
    revoked,
  });
}

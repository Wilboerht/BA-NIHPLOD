import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { authenticateInternalApi } from "@/lib/internal-auth";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

function maskContactInfo(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const text = value.trim();
  if (text.includes("@")) {
    const [local, domain] = text.split("@");
    return `${local.slice(0, 2)}***@${domain}`;
  }
  if (/^1[3-9]\d{9}$/.test(text)) return `${text.slice(0, 3)}****${text.slice(-2)}`;
  if (text.length <= 4) return "***";
  return `${text.slice(0, 2)}***${text.slice(-2)}`;
}

function preview(value: unknown, length = 80): string {
  const text = typeof value === "string" ? value : "";
  return text.length > length ? `${text.slice(0, length)}…` : text;
}

function iso(value: unknown): string {
  return value instanceof Date ? value.toISOString() : String(value ?? "");
}

// GET /api/internal/admin/dashboard
// 主站 BA 看板聚合数据（只读）。
export async function GET(request: Request) {
  const auth = await authenticateInternalApi(
    request,
    "/api/internal/admin/dashboard",
    "GET",
    ["ba"]
  );
  if (!auth.ok) return auth.response;

  const includeComplaints =
    new URL(request.url).searchParams.get("includeComplaints") === "true";

  try {
    const [
      certTotal,
      certValid,
      certPending,
      certExpiring,
      complaintPending,
      complaintInvestigating,
      complaintResolvedMonth,
      dealerTotal,
      adminTotal,
      adminSso,
      adminLocal,
      recentAudit,
    ] = await Promise.all([
      sql`SELECT COUNT(*)::int AS count FROM certificates WHERE deleted_at IS NULL`,
      sql`SELECT COUNT(*)::int AS count FROM certificates
          WHERE status = 'ISSUED' AND start_date <= CURRENT_DATE AND end_date >= CURRENT_DATE
            AND deleted_at IS NULL`,
      sql`SELECT COUNT(*)::int AS count FROM certificates
          WHERE status = 'PENDING' AND deleted_at IS NULL`,
      sql`SELECT COUNT(*)::int AS count FROM certificates
          WHERE status = 'ISSUED'
            AND end_date >= CURRENT_DATE AND end_date <= CURRENT_DATE + INTERVAL '30 days'
            AND deleted_at IS NULL`,
      sql`SELECT COUNT(*)::int AS count FROM complaints
          WHERE status = 'PENDING' AND deleted_at IS NULL`,
      sql`SELECT COUNT(*)::int AS count FROM complaints
          WHERE status = 'INVESTIGATING' AND deleted_at IS NULL`,
      sql`SELECT COUNT(*)::int AS count FROM complaints
          WHERE status = 'RESOLVED'
            AND updated_at >= date_trunc('month', CURRENT_TIMESTAMP)
            AND deleted_at IS NULL`,
      sql`SELECT COUNT(*)::int AS count FROM dealers`,
      sql`SELECT COUNT(*)::int AS count FROM profiles
          WHERE role IN ('SUPER_ADMIN', 'AUDITOR') AND deleted_at IS NULL`,
      sql`SELECT COUNT(*)::int AS count FROM profiles
          WHERE role IN ('SUPER_ADMIN', 'AUDITOR') AND deleted_at IS NULL AND auth_source = 'sso'`,
      sql`SELECT COUNT(*)::int AS count FROM profiles
          WHERE role IN ('SUPER_ADMIN', 'AUDITOR') AND deleted_at IS NULL AND auth_source = 'local'`,
      sql`SELECT id, action, actor_name, created_at
          FROM audit_logs
          ORDER BY created_at DESC
          LIMIT 5`,
    ]);

    const recentComplaints = includeComplaints
      ? await sql`
          SELECT c.id, c.channel, c.contact_info, c.description, c.status,
                 COALESCE(c.handled_by_name, p.full_name, p.username) AS handled_by,
                 c.created_at, c.updated_at,
                 (
                   COALESCE(array_length(c.evidence_image_urls, 1), 0)
                   + CASE WHEN c.evidence_image_url IS NOT NULL THEN 1 ELSE 0 END
                 ) AS evidence_count
          FROM complaints c
          LEFT JOIN profiles p ON c.handler_id = p.id
          WHERE c.deleted_at IS NULL
          ORDER BY c.created_at DESC
          LIMIT 5
        `
      : [];

    return NextResponse.json(
      {
        success: true,
        data: {
          certificates: {
            total: Number(certTotal[0]?.count ?? 0),
            valid: Number(certValid[0]?.count ?? 0),
            pending: Number(certPending[0]?.count ?? 0),
            expiring30d: Number(certExpiring[0]?.count ?? 0),
          },
          complaints: {
            pending: Number(complaintPending[0]?.count ?? 0),
            investigating: Number(complaintInvestigating[0]?.count ?? 0),
            resolvedThisMonth: Number(complaintResolvedMonth[0]?.count ?? 0),
            recent: recentComplaints.map((row: Record<string, unknown>) => ({
              id: String(row.id),
              channel: row.channel ? String(row.channel) : null,
              contactInfoMasked: maskContactInfo(row.contact_info),
              descriptionPreview: preview(row.description),
              status: String(row.status),
              evidenceCount: Number(row.evidence_count ?? 0),
              handledBy: row.handled_by ? String(row.handled_by) : null,
              createdAt: iso(row.created_at),
              updatedAt: iso(row.updated_at),
            })),
          },
          dealers: { total: Number(dealerTotal[0]?.count ?? 0) },
          admins: {
            total: Number(adminTotal[0]?.count ?? 0),
            sso: Number(adminSso[0]?.count ?? 0),
            local: Number(adminLocal[0]?.count ?? 0),
          },
          recentAudit: recentAudit.map((row: Record<string, unknown>) => ({
            id: String(row.id),
            action: String(row.action),
            actorName: row.actor_name ? String(row.actor_name) : null,
            createdAt: iso(row.created_at),
          })),
          generatedAt: new Date().toISOString(),
        },
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    logger.error("[InternalDashboard] failed", { error: String(error) });
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "查询 BA 看板失败" } },
      { status: 500 }
    );
  }
}

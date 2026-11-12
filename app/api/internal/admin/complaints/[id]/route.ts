import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { authenticateInternalApi } from "@/lib/internal-auth";
import { buildEvidenceUrl } from "@/lib/evidence-token";
import { logger } from "@/lib/logger";
import { isUuid } from "@/lib/validation";

export const dynamic = "force-dynamic";

function iso(value: unknown): string {
  return value instanceof Date ? value.toISOString() : String(value ?? "");
}

// GET /api/internal/admin/complaints/[id]
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const path = `/api/internal/admin/complaints/${id}`;
  const auth = await authenticateInternalApi(request, path, "GET", ["ba"]);
  if (!auth.ok) return auth.response;

  if (!isUuid(id)) {
    return NextResponse.json(
      { success: false, error: { code: "INVALID_ID", message: "举报 ID 无效" } },
      { status: 400 }
    );
  }

  const includeSensitive =
    new URL(request.url).searchParams.get("includeSensitive") === "true";

  try {
    const rows = await sql`
      SELECT c.*, p.full_name AS handler_name, p.username AS handler_username
      FROM complaints c
      LEFT JOIN profiles p ON c.handler_id = p.id
      WHERE c.id = ${id} AND c.deleted_at IS NULL
      LIMIT 1
    `;
    if (rows.length === 0) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "举报不存在" } },
        { status: 404 }
      );
    }
    const row = rows[0] as Record<string, unknown>;

    const logs = await sql`
      SELECT id, action, comment, actor_name, actor_source, created_at
      FROM audit_logs
      WHERE complaint_id = ${id}
      ORDER BY created_at DESC
      LIMIT 50
    `;

    const urls = Array.isArray(row.evidence_image_urls)
      ? (row.evidence_image_urls as unknown[]).filter(
          (item): item is string => typeof item === "string" && item.length > 0
        )
      : [];
    const evidence = includeSensitive
      ? urls
          .map((_: string, index: number) => {
            const url = buildEvidenceUrl(id, index);
            return url ? { index, url } : null;
          })
          .filter((item): item is { index: number; url: string } => item !== null)
      : [];
    const legacyEvidence =
      includeSensitive && typeof row.evidence_image_url === "string" && row.evidence_image_url
        ? [
            {
              index: urls.length,
              url:
                buildEvidenceUrl(id, urls.length) ??
                (row.evidence_image_url.startsWith("/")
                  ? `${(process.env.NEXT_PUBLIC_BASE_URL || "https://ba.nihplod.cn").replace(/\/+$/, "")}${row.evidence_image_url}`
                  : row.evidence_image_url),
            },
          ]
        : [];
    const evidenceCount =
      urls.length + (typeof row.evidence_image_url === "string" && row.evidence_image_url ? 1 : 0);

    return NextResponse.json(
      {
        success: true,
        data: {
          complaint: {
            id: String(row.id),
            description: String(row.description ?? ""),
            channel: row.channel ? String(row.channel) : null,
            contactInfo: includeSensitive && row.contact_info ? String(row.contact_info) : null,
            status: String(row.status),
            reviewNote: row.review_note ? String(row.review_note) : null,
            handledBy: row.handled_by_name
              ? String(row.handled_by_name)
              : row.handler_name
                ? String(row.handler_name)
                : row.handler_username
                  ? String(row.handler_username)
                  : null,
            evidenceCount,
            evidence: [...evidence, ...legacyEvidence],
            createdAt: iso(row.created_at),
            updatedAt: iso(row.updated_at),
          },
          auditLogs: logs.map((log: Record<string, unknown>) => ({
            id: String(log.id),
            action: String(log.action),
            comment: log.comment ? String(log.comment) : null,
            actorName: log.actor_name ? String(log.actor_name) : null,
            actorSource: log.actor_source ? String(log.actor_source) : null,
            createdAt: iso(log.created_at),
          })),
        },
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    logger.error("[InternalComplaints] detail failed", { error: String(error) });
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "查询举报失败" } },
      { status: 500 }
    );
  }
}

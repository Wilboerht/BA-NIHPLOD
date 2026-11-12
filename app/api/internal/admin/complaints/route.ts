import { NextResponse } from "next/server";
import { z } from "zod";
import { sql } from "@/lib/db";
import { authenticateInternalApi } from "@/lib/internal-auth";
import { buildContainsPattern } from "@/lib/validation";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  status: z
    .enum(["ALL", "PENDING", "INVESTIGATING", "RESOLVED", "REJECTED"])
    .default("ALL"),
  q: z.string().trim().max(200).optional(),
});

function maskContactInfo(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const text = value.trim();
  if (text.includes("@")) {
    const [local, domain] = text.split("@");
    const head = local.slice(0, 2);
    return `${head}***@${domain}`;
  }
  if (/^1[3-9]\d{9}$/.test(text)) {
    return `${text.slice(0, 3)}****${text.slice(-2)}`;
  }
  if (text.length <= 4) return "***";
  return `${text.slice(0, 2)}***${text.slice(-2)}`;
}

function preview(value: unknown, length = 80): string {
  const text = typeof value === "string" ? value : "";
  return text.length > length ? `${text.slice(0, length)}…` : text;
}

// GET /api/internal/admin/complaints
// 主站 BFF 读取 BA 举报列表（轻量摘要 + 脱敏联系方式）
export async function GET(request: Request) {
  const auth = await authenticateInternalApi(
    request,
    "/api/internal/admin/complaints",
    "GET",
    ["ba"]
  );
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(request.url);
  const parsed = querySchema.safeParse({
    page: searchParams.get("page") ?? "1",
    pageSize: searchParams.get("pageSize") ?? "20",
    status: searchParams.get("status") ?? "ALL",
    q: searchParams.get("q") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: { code: "INVALID_PARAMS", message: "查询参数无效" } },
      { status: 400 }
    );
  }

  const { page, pageSize, status, q } = parsed.data;
  const limit = pageSize;
  const offset = (page - 1) * pageSize;
  const statusCondition = status !== "ALL" ? sql` AND c.status = ${status}` : sql``;
  const likePattern = q ? buildContainsPattern(q) : null;
  const searchCondition = likePattern
    ? sql` AND (
        c.channel ILIKE ${likePattern}
        OR c.description ILIKE ${likePattern}
        OR c.contact_info ILIKE ${likePattern}
        OR c.id::text ILIKE ${likePattern}
      )`
    : sql``;

  try {
    const where = sql`WHERE c.deleted_at IS NULL ${statusCondition} ${searchCondition}`;
    const [rows, countRows] = await Promise.all([
      sql`
        SELECT c.id, c.channel, c.contact_info, c.description, c.status,
               c.handled_by_name, c.created_at, c.updated_at,
               COALESCE(c.handled_by_name, p.full_name, p.username) AS handled_by,
               (
                 COALESCE(array_length(c.evidence_image_urls, 1), 0)
                 + CASE WHEN c.evidence_image_url IS NOT NULL THEN 1 ELSE 0 END
               ) AS evidence_count
        FROM complaints c
        LEFT JOIN profiles p ON c.handler_id = p.id
        ${where}
        ORDER BY c.created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `,
      sql`SELECT COUNT(*)::int AS count FROM complaints c ${where}`,
    ]);

    return NextResponse.json(
      {
        success: true,
        data: {
          items: rows.map((row: Record<string, unknown>) => ({
            id: String(row.id),
            channel: row.channel ? String(row.channel) : null,
            contactInfoMasked: maskContactInfo(row.contact_info),
            descriptionPreview: preview(row.description),
            status: String(row.status),
            evidenceCount: Number(row.evidence_count ?? 0),
            handledBy: row.handled_by ? String(row.handled_by) : null,
            createdAt:
              row.created_at instanceof Date
                ? row.created_at.toISOString()
                : String(row.created_at),
            updatedAt:
              row.updated_at instanceof Date
                ? row.updated_at.toISOString()
                : String(row.updated_at),
          })),
          total: Number(countRows[0]?.count ?? 0),
          page,
          pageSize,
        },
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    logger.error("[InternalComplaints] list failed", { error: String(error) });
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "查询举报失败" } },
      { status: 500 }
    );
  }
}

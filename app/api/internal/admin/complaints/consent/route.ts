import { NextResponse } from "next/server";
import { z } from "zod";
import { sql } from "@/lib/db";
import { authenticateInternalApi } from "@/lib/internal-auth";
import { NON_DIGIT_PATTERN } from "@/lib/phone-match";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

const PATH = "/api/internal/admin/complaints/consent";

const querySchema = z.object({
  phone: z.string().trim().regex(/^1[3-9]\d{9}$/, "手机号格式无效"),
});

// GET /api/internal/admin/complaints/consent?phone=
// 主站管理端按手机号匹配 BA 投诉的隐私同意记录。
export async function GET(request: Request) {
  const auth = await authenticateInternalApi(request, PATH, "GET", ["ba"]);
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(request.url);
  const parsed = querySchema.safeParse({
    phone: searchParams.get("phone") ?? "",
  });
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: { code: "INVALID_PARAMS", message: "手机号格式无效" } },
      { status: 400 }
    );
  }

  const { phone } = parsed.data;
  const phoneMatch = sql`(
    contact_info = ${phone}
    OR regexp_replace(contact_info, ${NON_DIGIT_PATTERN}, '', 'g') = ${phone}
    OR regexp_replace(contact_info, ${NON_DIGIT_PATTERN}, '', 'g') = ('86' || ${phone})
  )`;

  try {
    const rows = await sql`
      SELECT consent_at, consent_version, consent_content_hash, created_at
      FROM complaints
      WHERE deleted_at IS NULL
        AND ${phoneMatch}
      ORDER BY created_at DESC
      LIMIT 20
    `;

    const countRows = await sql`
      SELECT COUNT(*)::int AS count
      FROM complaints
      WHERE deleted_at IS NULL
        AND ${phoneMatch}
    `;

    const latest = rows[0] as
      | {
          consent_at: Date | string | null;
          consent_version: string | null;
          consent_content_hash: string | null;
          created_at: Date | string;
        }
      | undefined;

    return NextResponse.json(
      {
        success: true,
        data: {
          count: Number(countRows[0]?.count ?? 0),
          latest: latest
            ? {
                consentAt:
                  latest.consent_at instanceof Date
                    ? latest.consent_at.toISOString()
                    : latest.consent_at,
                consentVersion: latest.consent_version,
                consentContentHash: latest.consent_content_hash,
                createdAt:
                  latest.created_at instanceof Date
                    ? latest.created_at.toISOString()
                    : String(latest.created_at),
              }
            : null,
        },
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    logger.error("[InternalComplaintConsent] query failed", {
      error: String(error),
    });
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "查询投诉授权失败" } },
      { status: 500 }
    );
  }
}

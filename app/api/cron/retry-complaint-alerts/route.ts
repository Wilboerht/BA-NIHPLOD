import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { notifyMainSiteComplaint } from "@/lib/complaint-notify";
import { logger } from "@/lib/logger";
import { isCronRequestAuthorized } from "@/lib/cron-auth";

export const dynamic = "force-dynamic";

const MAX_ATTEMPTS = 10;

// GET /api/cron/retry-complaint-alerts
// 重试 BA → 主站企业微信举报通知。
export async function GET(request: Request) {
  if (!isCronRequestAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const rows = await sql`
      SELECT id, channel, contact_info, description, created_at
      FROM complaints
      WHERE deleted_at IS NULL
        AND main_alerted_at IS NULL
        AND main_alert_attempts < ${MAX_ATTEMPTS}
      ORDER BY created_at ASC
      LIMIT 50
    `;

    let sent = 0;
    let failed = 0;

    for (const row of rows) {
      const result = await notifyMainSiteComplaint({
        complaintId: String(row.id),
        channel: row.channel ? String(row.channel) : null,
        contactInfo: row.contact_info ? String(row.contact_info) : null,
        description: String(row.description ?? ""),
        createdAt:
          row.created_at instanceof Date
            ? row.created_at.toISOString()
            : String(row.created_at),
      });

      if (result.ok) {
        sent += 1;
        await sql`
          UPDATE complaints
          SET main_alerted_at = NOW(),
              main_alert_last_error = NULL,
              updated_at = NOW()
          WHERE id = ${row.id}
        `;
      } else {
        failed += 1;
        await sql`
          UPDATE complaints
          SET main_alert_attempts = main_alert_attempts + 1,
              main_alert_last_error = ${result.error.slice(0, 500)},
              updated_at = NOW()
          WHERE id = ${row.id}
        `;
      }
    }

    return NextResponse.json({
      success: true,
      checked: rows.length,
      sent,
      failed,
    });
  } catch (error) {
    logger.error("[ComplaintAlertRetry] failed", { error: String(error) });
    return NextResponse.json(
      { success: false, error: "通知重试失败" },
      { status: 500 }
    );
  }
}

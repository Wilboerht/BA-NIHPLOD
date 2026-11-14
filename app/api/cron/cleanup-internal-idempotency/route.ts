import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { isCronRequestAuthorized } from "@/lib/cron-auth";

export const dynamic = "force-dynamic";

const BATCH_SIZE = 1000;
const MAX_BATCHES = 20;

// GET /api/cron/cleanup-internal-idempotency
// 清理已过期的内部 API 幂等记录，避免表无限增长。
export async function GET(request: Request) {
  if (!isCronRequestAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    let deleted = 0;
    let batches = 0;
    while (batches < MAX_BATCHES) {
      const rows = await sql`
        DELETE FROM internal_request_idempotency
        WHERE key IN (
          SELECT key
          FROM internal_request_idempotency
          WHERE expires_at <= NOW()
          ORDER BY expires_at ASC
          LIMIT ${BATCH_SIZE}
        )
        RETURNING key
      `;
      deleted += rows.length;
      batches += 1;
      if (rows.length < BATCH_SIZE) break;
    }

    if (deleted > 0) {
      await writeAudit(sql, {
        actor: { source: "system" },
        action: "CLEANUP_INTERNAL_IDEMPOTENCY",
        targetType: "system",
        targetRef: "cleanup-internal-idempotency",
        comment: `清理过期内部幂等记录 ${deleted} 条`,
        after: { deleted, batches },
        request,
      }).catch(() => {});
    }

    return NextResponse.json(
      { success: true, deleted, batches },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("[cron] cleanup internal idempotency failed", error);
    return NextResponse.json(
      { error: "定时任务执行失败" },
      { status: 500 },
    );
  }
}

import { createSignedInternalRequestHeaders } from "@/lib/internal-api";
import { logger } from "@/lib/logger";

const NOTIFY_PATH = "/api/internal/ba/complaint-submitted";

function mainSiteBase(): string {
  return (process.env.MAIN_SITE_INTERNAL_BASE || "http://127.0.0.1:3000").replace(/\/+$/, "");
}

export interface ComplaintNotificationInput {
  complaintId: string;
  channel: string | null;
  contactInfo: string | null;
  description: string;
  createdAt: string;
}

export async function notifyMainSiteComplaint(
  input: ComplaintNotificationInput
): Promise<{ ok: true } | { ok: false; error: string }> {
  const bodyText = JSON.stringify(input);
  const headers = createSignedInternalRequestHeaders(
    "ba",
    "POST",
    NOTIFY_PATH,
    bodyText,
    ""
  );
  if (!headers) {
    return { ok: false, error: "INTERNAL_API_KEYS 未配置 project=ba" };
  }

  try {
    const response = await fetch(`${mainSiteBase()}${NOTIFY_PATH}`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: bodyText,
      signal: AbortSignal.timeout(3000),
      cache: "no-store",
    });
    const json = (await response.json().catch(() => null)) as
      | { success?: boolean; error?: { code?: string; message?: string } }
      | null;
    if (!response.ok || !json?.success) {
      return {
        ok: false,
        error: json?.error?.message || `HTTP ${response.status}`,
      };
    }
    return { ok: true };
  } catch (error) {
    logger.warn("[ComplaintNotify] 通知主站失败", { error: String(error) });
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

import { createSignedInternalRequestHeaders } from "@/lib/internal-api";

const LEGAL_CONTENT_HASH_PATH = "/api/internal/legal/content-hash";

/**
 * BA 投诉提交时记录的隐私政策版本。
 * 与主站 LegalDocument 当前发布版本由发布流程同步；允许通过环境变量
 * 在发布窗口内统一更新，避免版本号散落在 SQL/组件中。
 */
export const PRIVACY_CONSENT_VERSION =
  process.env.PRIVACY_CONSENT_VERSION?.trim() || "2026-11-19";

/**
 * 读取主站当前已发布隐私政策的内容 hash，用于绑定投诉同意证据。
 * 主站短暂不可用时返回 null，投诉仍可提交，但不能伪装成有内容 hash。
 */
export async function fetchCurrentPrivacyContentHash(): Promise<string | null> {
  const path = LEGAL_CONTENT_HASH_PATH;
  const query = "document=PRIVACY";
  const headers = createSignedInternalRequestHeaders(
    "ba",
    "GET",
    path,
    "",
    query
  );
  if (!headers) return null;

  const base = (process.env.MAIN_SITE_INTERNAL_BASE || "http://127.0.0.1:3000").replace(
    /\/+$/,
    ""
  );

  try {
    const response = await fetch(`${base}${path}?${query}`, {
      headers,
      signal: AbortSignal.timeout(3000),
      cache: "no-store",
    });
    if (!response.ok) return null;
    const body = (await response.json().catch(() => null)) as
      | { success?: boolean; data?: { contentHash?: unknown } }
      | null;
    return body?.success && typeof body.data?.contentHash === "string"
      ? body.data.contentHash
      : null;
  } catch {
    return null;
  }
}

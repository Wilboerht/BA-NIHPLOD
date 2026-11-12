import { createHmac, timingSafeEqual } from "crypto";

const TTL_SECONDS = 5 * 60;

function secret(): string | null {
  const value = process.env.BA_EVIDENCE_TOKEN_SECRET;
  return value && value.trim() ? value.trim() : null;
}

function sign(payload: string): string {
  const key = secret();
  if (!key) throw new Error("BA_EVIDENCE_TOKEN_SECRET 未配置");
  return createHmac("sha256", key).update(payload).digest("hex");
}

export function createEvidenceToken(complaintId: string, index: number): {
  exp: number;
  token: string;
} {
  const exp = Math.floor(Date.now() / 1000) + TTL_SECONDS;
  const token = sign(`${complaintId}:${index}:${exp}`);
  return { exp, token };
}

export function verifyEvidenceToken(
  complaintId: string,
  index: number,
  exp: number,
  token: string
): boolean {
  if (!Number.isFinite(exp) || exp * 1000 <= Date.now()) return false;
  if (!/^[a-f0-9]{64}$/i.test(token)) return false;
  try {
    const expected = Buffer.from(sign(`${complaintId}:${index}:${exp}`), "hex");
    const provided = Buffer.from(token, "hex");
    return expected.length === provided.length && timingSafeEqual(expected, provided);
  } catch {
    return false;
  }
}

export function buildEvidenceUrl(complaintId: string, index: number): string | null {
  if (!secret()) return null;
  const { exp, token } = createEvidenceToken(complaintId, index);
  const base = (process.env.NEXT_PUBLIC_BASE_URL || "https://ba.nihplod.cn").replace(/\/+$/, "");
  return `${base}/api/evidence/complaints/${encodeURIComponent(
    complaintId
  )}/${index}?exp=${exp}&token=${token}`;
}

import { verifySync } from "otplib";

const USED_TTL_MS = 60 * 1000;
const usedCodes = new Map<string, number>();

/**
 * 校验 BA 本地应急账号 TOTP。
 * 同一 secret + code 在有效窗口内只允许使用一次。
 */
export function verifyBreakGlassTotp(token: string, secret: string): boolean {
  const trimmedToken = String(token || "").replace(/\s+/g, "");
  if (!/^\d{6}$/.test(trimmedToken)) return false;

  const result = verifySync({ token: trimmedToken, secret });
  if (!result.valid) return false;

  const now = Date.now();
  for (const [key, expiresAt] of usedCodes) {
    if (expiresAt <= now) usedCodes.delete(key);
  }
  const key = `${secret}:${trimmedToken}`;
  if (usedCodes.has(key)) return false;
  usedCodes.set(key, now + USED_TTL_MS);
  return true;
}

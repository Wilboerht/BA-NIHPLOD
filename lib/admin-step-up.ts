import { createHash, randomBytes } from "crypto";
import { sql } from "@/lib/db";

const IS_PRODUCTION = process.env.NODE_ENV === "production";
export const ADMIN_STEP_UP_COOKIE_NAME = IS_PRODUCTION
  ? "__Host-ba_admin_step_up"
  : "ba_admin_step_up";

const REQUEST_TTL_MS = 5 * 60 * 1000;

function parseGrantTtlSeconds(): number {
  const raw = Number(process.env.BA_STEP_UP_GRANT_TTL_SECONDS || "120");
  if (!Number.isFinite(raw)) return 120;
  return Math.min(300, Math.max(30, Math.floor(raw)));
}

export const ADMIN_STEP_UP_GRANT_TTL_SECONDS = parseGrantTtlSeconds();

export const ADMIN_STEP_UP_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: IS_PRODUCTION,
  sameSite: "strict" as const,
  path: "/",
  maxAge: ADMIN_STEP_UP_GRANT_TTL_SECONDS,
};

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export interface StepUpRequestRow {
  id: string;
  profileId: string;
  externalAdminId: string | null;
  action: string;
  resourceId: string;
  returnTo: string;
  flowId: string;
  expiresAt: Date;
  consumedAt: Date | null;
}

export async function createAdminStepUpRequest(params: {
  profileId: string;
  externalAdminId: string | null;
  action: string;
  resourceId: string;
  returnTo: string;
  flowId: string;
}): Promise<{ state: string; expiresAt: Date }> {
  const state = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + REQUEST_TTL_MS);
  await sql`
    INSERT INTO admin_step_up_requests (
      state_hash, profile_id, external_admin_id, action, resource_id,
      return_to, flow_id, expires_at
    ) VALUES (
      ${hash(state)}, ${params.profileId}, ${params.externalAdminId},
      ${params.action}, ${params.resourceId}, ${params.returnTo},
      ${params.flowId}, ${expiresAt}
    )
  `;
  return { state, expiresAt };
}

export async function findAdminStepUpRequest(state: string): Promise<StepUpRequestRow | null> {
  const rows = await sql`
    SELECT id, profile_id, external_admin_id, action, resource_id, return_to,
           flow_id, expires_at, consumed_at
    FROM admin_step_up_requests
    WHERE state_hash = ${hash(state)}
    LIMIT 1
  `;
  const row = rows[0] as Record<string, unknown> | undefined;
  if (!row) return null;
  return {
    id: String(row.id),
    profileId: String(row.profile_id),
    externalAdminId: row.external_admin_id ? String(row.external_admin_id) : null,
    action: String(row.action),
    resourceId: String(row.resource_id),
    returnTo: String(row.return_to),
    flowId: String(row.flow_id),
    expiresAt: new Date(row.expires_at as string | Date),
    consumedAt: row.consumed_at ? new Date(row.consumed_at as string | Date) : null,
  };
}

export async function consumeAdminStepUpRequest(requestId: string): Promise<boolean> {
  const rows = await sql`
    UPDATE admin_step_up_requests
    SET consumed_at = NOW()
    WHERE id = ${requestId}
      AND consumed_at IS NULL
      AND expires_at > NOW()
    RETURNING id
  `;
  return rows.length === 1;
}

export async function issueAdminStepUpGrant(params: {
  ticketJti: string;
  profileId: string;
  externalAdminId: string | null;
  action: string;
  resourceId: string;
}): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + ADMIN_STEP_UP_GRANT_TTL_SECONDS * 1000);
  await sql`
    INSERT INTO admin_step_up_grants (
      token_hash, ticket_jti, profile_id, external_admin_id, action,
      resource_id, expires_at
    ) VALUES (
      ${hash(token)}, ${params.ticketJti}, ${params.profileId},
      ${params.externalAdminId}, ${params.action}, ${params.resourceId},
      ${expiresAt}
    )
  `;
  return { token, expiresAt };
}

function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const [key, ...valueParts] = part.trim().split("=");
    if (key === name) {
      try {
        return decodeURIComponent(valueParts.join("="));
      } catch {
        return null;
      }
    }
  }
  return null;
}

export async function consumeAdminStepUpGrant(
  request: Request,
  params: { profileId: string; action: string; resourceId: string }
): Promise<boolean> {
  const token = readCookie(request, ADMIN_STEP_UP_COOKIE_NAME);
  if (!token) return false;
  const rows = await sql`
    UPDATE admin_step_up_grants
    SET used_at = NOW()
    WHERE token_hash = ${hash(token)}
      AND profile_id = ${params.profileId}
      AND action = ${params.action}
      AND resource_id = ${params.resourceId}
      AND used_at IS NULL
      AND expires_at > NOW()
    RETURNING id
  `;
  return rows.length === 1;
}

export async function cleanupExpiredAdminStepUp(): Promise<void> {
  await Promise.all([
    sql`DELETE FROM admin_step_up_requests WHERE expires_at < NOW() - INTERVAL '1 hour'`,
    sql`DELETE FROM admin_step_up_grants WHERE expires_at < NOW() - INTERVAL '1 hour'`,
  ]);
}

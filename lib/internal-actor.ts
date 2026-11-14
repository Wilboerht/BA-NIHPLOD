import { sql } from "@/lib/db";

export interface InternalActorInput {
  externalAdminId: string;
  email?: string;
  name?: string;
  baRole?: string;
  capabilities?: string[];
}

export interface ResolvedInternalActor {
  profileId: string;
  externalAdminId: string;
  email: string | null;
  name: string | null;
  role: string;
  source?: "main" | "ba";
  capabilities: Set<string>;
}

export class InternalActorError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status = 403) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export function parseInternalActorPayload(
  value: unknown,
): InternalActorInput | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const externalAdminId =
    typeof record.externalAdminId === "string"
      ? record.externalAdminId
      : typeof record.id === "string"
        ? record.id
        : "";
  if (!externalAdminId || externalAdminId.length > 64) return null;
  const capabilities = Array.isArray(record.capabilities)
    ? record.capabilities.filter(
        (item): item is string => typeof item === "string",
      )
    : [];
  return {
    externalAdminId,
    email:
      typeof record.email === "string" ? record.email.slice(0, 255) : undefined,
    name:
      typeof record.name === "string" ? record.name.slice(0, 100) : undefined,
    baRole:
      typeof record.baRole === "string"
        ? record.baRole.slice(0, 50)
        : undefined,
    capabilities,
  };
}

export function readInternalActorFromRequest(
  request: Request,
): InternalActorInput | null {
  const header = request.headers.get("x-internal-actor");
  if (!header) return null;
  try {
    const raw = Buffer.from(header, "base64url").toString("utf8");
    return parseInternalActorPayload(JSON.parse(raw));
  } catch {
    return null;
  }
}

function isSuperAdminActorRole(role: string | null | undefined): boolean {
  return (role || "").trim().toLowerCase() === "super_admin";
}

export async function resolveInternalActor(
  input: InternalActorInput | null,
  requiredCapability?: string,
): Promise<ResolvedInternalActor> {
  if (!input) {
    throw new InternalActorError("ACTOR_REQUIRED", "缺少内部操作人身份", 401);
  }
  if (
    requiredCapability &&
    !(input.capabilities ?? []).includes(requiredCapability)
  ) {
    throw new InternalActorError("FORBIDDEN", "操作人缺少所需证书权限");
  }

  let profile = (
    await sql`
      SELECT id, role, is_banned, deleted_at, email, full_name
      FROM profiles
      WHERE external_admin_id = ${input.externalAdminId}
      LIMIT 1
    `
  )[0];

  if (!profile) {
    await sql`
      INSERT INTO profiles (
        username, full_name, email, role, is_first_login, is_banned,
        auth_source, external_admin_id, external_role, external_token_version,
        last_synced_at, created_at, updated_at
      ) VALUES (
        NULL, ${input.name ?? null}, ${input.email ?? null},
        ${isSuperAdminActorRole(input.baRole) ? "SUPER_ADMIN" : "AUDITOR"},
        FALSE, FALSE,
        'sso', ${input.externalAdminId}, ${input.baRole ?? null}, NULL,
        NOW(), NOW(), NOW()
      )
      ON CONFLICT (external_admin_id) DO NOTHING
    `;
    profile = (
      await sql`
        SELECT id, role, is_banned, deleted_at, email, full_name
        FROM profiles
        WHERE external_admin_id = ${input.externalAdminId}
        LIMIT 1
      `
    )[0];
  }

  if (!profile || profile.deleted_at) {
    throw new InternalActorError("ACTOR_NOT_FOUND", "BA 操作人不存在或已删除");
  }
  if (profile.is_banned) {
    throw new InternalActorError("ACTOR_BANNED", "BA 操作人已被禁用");
  }

  return {
    profileId: String(profile.id),
    externalAdminId: input.externalAdminId,
    email: profile.email ? String(profile.email) : (input.email ?? null),
    name: profile.full_name ? String(profile.full_name) : (input.name ?? null),
    role: isSuperAdminActorRole(input.baRole) ? "SUPER_ADMIN" : "AUDITOR",
    source: "main",
    capabilities: new Set(input.capabilities ?? []),
  };
}

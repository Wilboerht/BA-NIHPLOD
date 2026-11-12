/**
 * BA 侧主站管理员 SSO
 *
 * 主站是管理员身份/密码/TOTP/权限的唯一来源；
 * BA 只保留影子 AdminUser（业务外键/审计/本地会话）。
 * 断言默认 RS256，BA 通过 JWKS 公钥验签，不持有签名私钥。
 */
import { createHash, randomBytes } from "crypto";
import { createRemoteJWKSet, importSPKI, jwtVerify } from "jose";
import { sql } from "@/lib/db";
import { createToken, setAuthCookie } from "@/lib/auth";
import { logger } from "@/lib/logger";

export const ADMIN_SSO_AUDIENCE = "ba-admin";
export const ADMIN_SSO_ISSUER = "https://nihplod.cn";

export const ADMIN_SSO_STATE_COOKIE =
  process.env.NODE_ENV === "production" ? "__Host-ba_admin_sso_state" : "ba_admin_sso_state";
export const ADMIN_SSO_VERIFIER_COOKIE =
  process.env.NODE_ENV === "production" ? "__Host-ba_admin_sso_verifier" : "ba_admin_sso_verifier";
export const ADMIN_SSO_RETURN_COOKIE =
  process.env.NODE_ENV === "production" ? "__Host-ba_admin_sso_return" : "ba_admin_sso_return";

export const ADMIN_SSO_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: 300,
};

export type LocalAdminRole = "SUPER_ADMIN" | "AUDITOR";
export type BaSsoRole = "super_admin" | "auditor";
export type LocalLoginMode = "all" | "break-glass" | "disabled";

export interface AdminSsoConfig {
  enabled: boolean;
  authorizeUrl: string;
  issuer: string;
  tokenUrl: string;
  statusUrl: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  audience: string;
  jwksUrl: string;
  publicKey: string | null;
  allowLegacyHs256: boolean;
  legacySecret: string | null;
  sessionTtlMinutes: number;
  localLoginMode: LocalLoginMode;
  emailFallback: boolean;
  breakGlass: {
    enabled: boolean;
    username: string;
    totpSecret: string | null;
  };
}

function normalizePem(raw: string): string {
  return raw.includes("\\n") ? raw.replace(/\\n/g, "\n") : raw;
}

function assertHttpsOrLoopback(name: string, value: string): void {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`[AdminSSO] ${name} 不是合法 URL`);
  }
  if (
    parsed.protocol !== "https:" &&
    !["127.0.0.1", "localhost", "::1"].includes(parsed.hostname)
  ) {
    throw new Error(`[AdminSSO] ${name} 必须使用 https 或本机回环地址`);
  }
}

function parseLocalLoginMode(raw: string | undefined): LocalLoginMode {
  if (raw === "break-glass" || raw === "disabled" || raw === "all") return raw;
  return "all";
}

export function getAdminSsoConfig(): AdminSsoConfig {
  const enabled = process.env.ADMIN_SSO_ENABLED === "true";
  const authorizeUrl = process.env.ADMIN_SSO_AUTHORIZE_URL || `${ADMIN_SSO_ISSUER}/admin/sso/authorize`;
  let issuer = ADMIN_SSO_ISSUER;
  try {
    issuer = new URL(authorizeUrl).origin;
  } catch {
    // 保留默认 issuer；配置错误会在跳转时暴露
  }

  const clientId = process.env.ADMIN_SSO_CLIENT_ID || "ba-admin";
  const clientSecret = process.env.ADMIN_SSO_CLIENT_SECRET || "";
  const redirectUri = process.env.ADMIN_SSO_REDIRECT_URI || "";
  const tokenUrl = process.env.ADMIN_SSO_TOKEN_URL || "http://127.0.0.1:3000/api/admin/sso/token";
  const statusUrl =
    process.env.ADMIN_SSO_STATUS_URL || "http://127.0.0.1:3000/api/admin/sso/status";
  const audience = process.env.ADMIN_SSO_AUDIENCE?.trim() || ADMIN_SSO_AUDIENCE;
  const jwksUrl =
    process.env.ADMIN_SSO_JWKS_URL || new URL("/api/oauth/jwks", tokenUrl).toString();

  if (enabled) {
    if (!clientSecret) throw new Error("[AdminSSO] ADMIN_SSO_CLIENT_SECRET 未配置");
    if (clientSecret.length < 32) {
      throw new Error("[AdminSSO] ADMIN_SSO_CLIENT_SECRET 至少需要 32 位");
    }
    if (!redirectUri) throw new Error("[AdminSSO] ADMIN_SSO_REDIRECT_URI 未配置");
  }

  for (const [name, value] of [
    ["ADMIN_SSO_TOKEN_URL", tokenUrl],
    ["ADMIN_SSO_STATUS_URL", statusUrl],
    ["ADMIN_SSO_JWKS_URL", jwksUrl],
  ] as const) {
    assertHttpsOrLoopback(name, value);
  }
  if (redirectUri) assertHttpsOrLoopback("ADMIN_SSO_REDIRECT_URI", redirectUri);

  const ttlRaw = Number(process.env.ADMIN_SSO_SESSION_TTL_MINUTES || "480");
  const legacySecret = process.env.ADMIN_SSO_SECRET || null;
  const allowLegacyHs256 =
    Boolean(legacySecret) && process.env.ADMIN_SSO_ALLOW_LEGACY_HS256 === "true";

  return {
    enabled,
    authorizeUrl,
    issuer,
    tokenUrl,
    statusUrl,
    clientId,
    clientSecret,
    redirectUri,
    audience,
    jwksUrl,
    publicKey: process.env.ADMIN_SSO_PUBLIC_KEY || null,
    allowLegacyHs256,
    legacySecret,
    sessionTtlMinutes:
      Number.isFinite(ttlRaw) && ttlRaw > 0 ? Math.min(Math.floor(ttlRaw), 480) : 480,
    localLoginMode: parseLocalLoginMode(process.env.ADMIN_SSO_LOCAL_LOGIN_MODE),
    emailFallback: process.env.ADMIN_SSO_EMAIL_FALLBACK === "true",
    breakGlass: {
      enabled: process.env.BA_BREAK_GLASS_ENABLED === "true",
      username: process.env.BA_BREAK_GLASS_USERNAME?.trim() || "ba-emergency",
      totpSecret: process.env.BA_BREAK_GLASS_TOTP_SECRET?.trim() || null,
    },
  };
}

export function isAdminSsoEnabled(): boolean {
  return process.env.ADMIN_SSO_ENABLED === "true";
}

export class AdminSsoError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status = 400
  ) {
    super(message);
    this.name = "AdminSsoError";
  }
}

export function createSsoState(): string {
  return randomBytes(32).toString("base64url");
}

export function createPkcePair(): { verifier: string; challenge: string } {
  const verifier = randomBytes(48).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

export interface AdminSsoClaims {
  iss: string;
  aud: string;
  sub: string;
  email: string;
  name: string;
  role: string;
  permissions: string[];
  clientRole: string;
  baRole: string | null;
  ver: number;
  totp: boolean;
  mainSessionExp: number;
  iat: number;
  exp: number;
  jti: string;
}

const staticPublicKeyCache = new Map<string, CryptoKey>();
let cachedRemoteJwks: { url: string; jwks: ReturnType<typeof createRemoteJWKSet> } | null = null;

async function getStaticPublicKey(pem: string): Promise<CryptoKey> {
  const normalized = normalizePem(pem);
  const cached = staticPublicKeyCache.get(normalized);
  if (cached) return cached;
  const key = await importSPKI(normalized, "RS256");
  staticPublicKeyCache.set(normalized, key);
  return key;
}

function getRemoteJwks(url: string): ReturnType<typeof createRemoteJWKSet> {
  if (!cachedRemoteJwks || cachedRemoteJwks.url !== url) {
    cachedRemoteJwks = {
      url,
      jwks: createRemoteJWKSet(new URL(url), {
        timeoutDuration: 5000,
        cooldownDuration: 30000,
        cacheMaxAge: 600000,
      }),
    };
  }
  return cachedRemoteJwks.jwks;
}

function getUnverifiedJwtAlg(token: string): string | null {
  const header = token.split(".")[0];
  if (!header) return null;
  try {
    const parsed = JSON.parse(Buffer.from(header, "base64url").toString("utf8")) as {
      alg?: unknown;
    };
    return typeof parsed.alg === "string" ? parsed.alg : null;
  } catch {
    return null;
  }
}

async function verifyRs256(
  assertion: string,
  config: AdminSsoConfig
): Promise<Record<string, unknown>> {
  const options = {
    issuer: config.issuer,
    audience: config.audience,
    algorithms: ["RS256"],
    clockTolerance: 30,
  };
  if (config.publicKey) {
    const { payload } = await jwtVerify(
      assertion,
      await getStaticPublicKey(config.publicKey),
      options
    );
    return payload as Record<string, unknown>;
  }
  const { payload } = await jwtVerify(assertion, getRemoteJwks(config.jwksUrl), options);
  return payload as Record<string, unknown>;
}

async function verifyLegacyHs256(
  assertion: string,
  config: AdminSsoConfig
): Promise<Record<string, unknown>> {
  if (!config.legacySecret) throw new Error("legacy HS256 secret not configured");
  const { payload } = await jwtVerify(
    assertion,
    new TextEncoder().encode(config.legacySecret),
    {
      issuer: config.issuer,
      audience: config.audience,
      algorithms: ["HS256"],
      clockTolerance: 30,
    }
  );
  return payload as Record<string, unknown>;
}

const usedJti = new Map<string, number>();

function consumeJti(jti: string, expSeconds: number): boolean {
  const now = Date.now();
  for (const [key, expiresAt] of usedJti) {
    if (expiresAt <= now) usedJti.delete(key);
  }
  if (usedJti.has(jti)) return false;
  usedJti.set(jti, expSeconds * 1000 + 60_000);
  return true;
}

export async function verifyAdminSsoAssertion(
  assertion: string,
  config: AdminSsoConfig
): Promise<AdminSsoClaims> {
  let payload: Record<string, unknown>;
  let legacy = false;
  const alg = getUnverifiedJwtAlg(assertion);

  if (alg === "RS256") {
    try {
      payload = await verifyRs256(assertion, config);
    } catch {
      throw new AdminSsoError("INVALID_ASSERTION", "管理员断言无效或已过期", 401);
    }
  } else if (alg === "HS256" && config.allowLegacyHs256 && config.legacySecret) {
    try {
      payload = await verifyLegacyHs256(assertion, config);
      legacy = true;
      logger.warn("[AdminSSO] 正在使用旧 HS256 断言，请尽快切换 RS256/JWKS");
    } catch {
      throw new AdminSsoError("INVALID_ASSERTION", "管理员断言无效或已过期", 401);
    }
  } else {
    throw new AdminSsoError("INVALID_ASSERTION", "管理员断言签名算法不受支持", 401);
  }

  const permissions = Array.isArray(payload.permissions)
    ? payload.permissions.filter((item): item is string => typeof item === "string")
    : [];

  const clientRole = typeof payload.clientRole === "string" ? payload.clientRole : "";
  const baRole = typeof payload.baRole === "string" ? payload.baRole : null;

  if (
    payload.client_id !== config.clientId ||
    typeof payload.sub !== "string" ||
    typeof payload.email !== "string" ||
    typeof payload.name !== "string" ||
    typeof payload.role !== "string" ||
    (clientRole !== "super_admin" && clientRole !== "auditor") ||
    typeof payload.ver !== "number" ||
    !Number.isFinite(payload.ver) ||
    typeof payload.totp !== "boolean" ||
    typeof payload.mainSessionExp !== "number" ||
    !Number.isFinite(payload.mainSessionExp) ||
    typeof payload.exp !== "number" ||
    !Number.isFinite(payload.exp) ||
    typeof payload.jti !== "string"
  ) {
    throw new AdminSsoError("INVALID_ASSERTION", "管理员断言字段不完整", 401);
  }
  if (!legacy && payload.token_use !== "admin_sso") {
    throw new AdminSsoError("INVALID_ASSERTION", "管理员断言类型不正确", 401);
  }
  if (payload.mainSessionExp * 1000 <= Date.now()) {
    throw new AdminSsoError("MAIN_SESSION_EXPIRED", "主站登录已过期，请重新登录", 401);
  }
  if (!payload.totp) {
    throw new AdminSsoError("TOTP_REQUIRED", "请先在主站开启二次验证", 403);
  }
  if (!consumeJti(payload.jti, payload.exp)) {
    throw new AdminSsoError("ASSERTION_REPLAYED", "管理员断言已被使用", 401);
  }

  return {
    iss: String(payload.iss),
    aud: String(payload.aud),
    sub: payload.sub,
    email: payload.email,
    name: payload.name,
    role: payload.role,
    permissions,
    clientRole,
    baRole,
    ver: payload.ver,
    totp: payload.totp,
    mainSessionExp: payload.mainSessionExp,
    iat: typeof payload.iat === "number" ? payload.iat : 0,
    exp: payload.exp,
    jti: payload.jti,
  };
}

export function resolveLocalAdminRole(claims: AdminSsoClaims): LocalAdminRole | null {
  const role = claims.baRole || claims.clientRole;
  const isSuper = claims.role === "owner" || claims.permissions.includes("ba:admin");
  if (role === "super_admin" && isSuper) return "SUPER_ADMIN";
  if (role === "auditor" && claims.permissions.includes("ba:access")) return "AUDITOR";
  return null;
}

export interface ShadowAdmin {
  id: string;
  username: string;
  email: string | null;
  full_name: string | null;
  role: string;
  token_version: number;
}

function sanitizeUsernameBase(email: string): string {
  const local = email.split("@")[0] || "admin";
  const cleaned = local.toLowerCase().replace(/[^a-z0-9._-]/g, "").slice(0, 32);
  return cleaned || "admin";
}

async function uniqueUsername(base: string): Promise<string> {
  let candidate = base;
  for (let i = 2; i < 100; i += 1) {
    const rows = await sql`SELECT id FROM profiles WHERE username = ${candidate} LIMIT 1`;
    if (rows.length === 0) return candidate;
    candidate = `${base}-${i}`;
  }
  return `${base}-${Date.now().toString(36)}`;
}

export async function upsertShadowAdmin(
  claims: AdminSsoClaims,
  localRole: LocalAdminRole
): Promise<ShadowAdmin> {
  const existing = await sql`
    SELECT id, username, email, full_name, role, token_version
    FROM profiles
    WHERE external_admin_id = ${claims.sub}
    LIMIT 1
  `;
  if (existing.length > 0) {
    const updated = await sql`
      UPDATE profiles
      SET email = ${claims.email},
          full_name = ${claims.name},
          role = ${localRole},
          is_banned = FALSE,
          is_first_login = FALSE,
          deleted_at = NULL,
          auth_source = 'sso',
          external_admin_id = ${claims.sub},
          external_role = ${claims.role},
          external_token_version = ${claims.ver},
          main_totp_enabled = ${claims.totp},
          last_login_at = NOW(),
          last_synced_at = NOW(),
          updated_at = NOW()
      WHERE id = ${existing[0].id}
      RETURNING id, username, email, full_name, role, token_version
    `;
    if (updated.length === 0) {
      throw new AdminSsoError("ADMIN_INACTIVE", "管理员账号不可用", 401);
    }
    return updated[0] as ShadowAdmin;
  }

  const emailRows = await sql`
    SELECT id, external_admin_id
    FROM profiles
    WHERE email IS NOT NULL AND lower(email) = lower(${claims.email}) AND deleted_at IS NULL
    LIMIT 1
  `;
  if (emailRows.length > 0) {
    if (!claims.email || process.env.ADMIN_SSO_EMAIL_FALLBACK !== "true") {
      throw new AdminSsoError(
        "EMAIL_CONFLICT",
        "该邮箱已存在 BA 管理员账号，请先由超管完成绑定",
        409
      );
    }
    if (
      emailRows[0].external_admin_id &&
      emailRows[0].external_admin_id !== claims.sub
    ) {
      throw new AdminSsoError("EMAIL_CONFLICT", "该邮箱已绑定其他主站管理员", 409);
    }
    const updated = await sql`
      UPDATE profiles
      SET email = ${claims.email},
          full_name = ${claims.name},
          role = ${localRole},
          is_banned = FALSE,
          is_first_login = FALSE,
          auth_source = 'sso',
          external_admin_id = ${claims.sub},
          external_role = ${claims.role},
          external_token_version = ${claims.ver},
          main_totp_enabled = ${claims.totp},
          last_login_at = NOW(),
          last_synced_at = NOW(),
          updated_at = NOW()
      WHERE id = ${emailRows[0].id} AND deleted_at IS NULL
      RETURNING id, username, email, full_name, role, token_version
    `;
    if (updated.length === 0) {
      throw new AdminSsoError("ADMIN_INACTIVE", "管理员账号不可用", 401);
    }
    return updated[0] as ShadowAdmin;
  }

  const username = await uniqueUsername(sanitizeUsernameBase(claims.email));
  const created = await sql`
    INSERT INTO profiles (
      username, full_name, email, password_hash, role, is_first_login, is_banned,
      token_version, auth_source, external_admin_id, external_role,
      external_token_version, main_totp_enabled, last_login_at, last_synced_at
    ) VALUES (
      ${username}, ${claims.name}, ${claims.email}, NULL, ${localRole}, FALSE, FALSE,
      0, 'sso', ${claims.sub}, ${claims.role}, ${claims.ver}, ${claims.totp}, NOW(), NOW()
    )
    RETURNING id, username, email, full_name, role, token_version
  `;
  return created[0] as ShadowAdmin;
}

export interface SsoSessionResult {
  token: string;
  cookie: string;
  maxAgeSeconds: number;
}

export async function createSsoAdminSession(
  shadow: ShadowAdmin,
  claims: AdminSsoClaims,
  config: AdminSsoConfig
): Promise<SsoSessionResult> {
  const configuredTtlMs = config.sessionTtlMinutes * 60 * 1000;
  const mainRemainingMs = claims.mainSessionExp * 1000 - Date.now();
  const ttlMs = Math.min(configuredTtlMs, mainRemainingMs);
  if (!Number.isFinite(ttlMs) || ttlMs <= 60_000) {
    throw new AdminSsoError("MAIN_SESSION_EXPIRED", "主站登录即将过期，请重新登录", 401);
  }
  const maxAgeSeconds = Math.floor(ttlMs / 1000);
  const token = await createToken(
    {
      id: shadow.id,
      username: shadow.username,
      full_name: shadow.full_name ?? undefined,
      role: shadow.role,
      is_banned: false,
      is_first_login: false,
      token_version: shadow.token_version,
      auth_source: "sso",
      external_admin_id: claims.sub,
    },
    { expiresInSeconds: maxAgeSeconds }
  );
  return { token, cookie: setAuthCookie(token, maxAgeSeconds), maxAgeSeconds };
}

export async function exchangeAdminSsoCode(
  code: string,
  codeVerifier: string,
  config: AdminSsoConfig
): Promise<string> {
  let response: Response;
  try {
    response = await fetch(config.tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        code,
        redirect_uri: config.redirectUri,
        code_verifier: codeVerifier,
      }),
      signal: AbortSignal.timeout(5000),
      cache: "no-store",
    });
  } catch {
    throw new AdminSsoError("TOKEN_ENDPOINT_UNREACHABLE", "主站认证服务不可达", 502);
  }

  const json = (await response.json().catch(() => null)) as
    | { success?: boolean; data?: { assertion?: string }; error?: { code?: string; message?: string } }
    | null;
  if (!response.ok || !json?.success || !json.data?.assertion) {
    throw new AdminSsoError(
      json?.error?.code || "TOKEN_EXCHANGE_FAILED",
      json?.error?.message || "主站管理员认证失败",
      response.status >= 400 ? response.status : 502
    );
  }
  return json.data.assertion;
}

export interface MainAdminStatus {
  id: string;
  email: string | null;
  name: string | null;
  role: string;
  permissions: string[];
  clientRole: string | null;
  baRole: string | null;
  ver: number;
  status: string;
  deletedAt: string | null;
  totpEnabled: boolean;
}

export async function fetchMainAdminStatuses(
  adminIds: string[],
  config: AdminSsoConfig
): Promise<MainAdminStatus[]> {
  if (adminIds.length === 0) return [];
  let response: Response;
  try {
    response = await fetch(config.statusUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        adminIds: adminIds.slice(0, 100),
      }),
      signal: AbortSignal.timeout(5000),
      cache: "no-store",
    });
  } catch {
    throw new AdminSsoError("STATUS_ENDPOINT_UNREACHABLE", "主站状态接口不可达", 502);
  }

  const json = (await response.json().catch(() => null)) as
    | {
        success?: boolean;
        data?: { admins?: MainAdminStatus[] };
        error?: { code?: string; message?: string };
      }
    | null;
  if (!response.ok || !json?.success) {
    throw new AdminSsoError(
      json?.error?.code || "STATUS_ENDPOINT_FAILED",
      json?.error?.message || "主站管理员状态同步失败",
      response.status >= 400 ? response.status : 502
    );
  }
  const admins = json.data?.admins;
  if (!Array.isArray(admins)) {
    throw new AdminSsoError("STATUS_ENDPOINT_INVALID", "主站状态响应缺少 admins", 502);
  }
  if (admins.length < adminIds.length) {
    throw new AdminSsoError("STATUS_ENDPOINT_INCOMPLETE", "主站状态响应不完整，跳过本轮同步", 502);
  }
  return admins;
}

import { createRemoteJWKSet, importSPKI, jwtVerify } from "jose";

export interface AdminStepUpClaims {
  sub: string;
  client_id: string;
  state: string;
  action: string;
  resource_id: string;
  ver: number;
  totp: boolean;
  mainSessionExp: number;
  jti: string;
  exp: number;
}

export interface AdminStepUpVerifyConfig {
  publicKey: string | null;
  jwksUrl: string;
  issuer: string;
  clientId: string;
}

export interface StepUpRequestBinding {
  externalAdminId: string | null;
  action: string;
  resourceId: string;
}

export type StepUpClaimMismatch =
  | "admin"
  | "client"
  | "state"
  | "action"
  | "resource";

export class AdminStepUpTicketError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status = 401) {
    super(message);
    this.name = "AdminStepUpTicketError";
    this.code = code;
    this.status = status;
  }
}

const remoteJwks = new Map<string, ReturnType<typeof createRemoteJWKSet>>();
const staticKeys = new Map<string, CryptoKey>();

async function verifySignature(
  ticket: string,
  config: AdminStepUpVerifyConfig,
  audience: string
): Promise<Record<string, unknown>> {
  if (config.publicKey) {
    const pem = config.publicKey.includes("\\n")
      ? config.publicKey.replace(/\\n/g, "\n")
      : config.publicKey;
    let key = staticKeys.get(pem);
    if (!key) {
      key = await importSPKI(pem, "RS256");
      staticKeys.set(pem, key);
    }
    const { payload } = await jwtVerify(ticket, key, {
      issuer: config.issuer,
      audience,
      algorithms: ["RS256"],
      clockTolerance: 30,
    });
    return payload as Record<string, unknown>;
  }

  let jwks = remoteJwks.get(config.jwksUrl);
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(config.jwksUrl), {
      timeoutDuration: 5000,
      cooldownDuration: 30000,
      cacheMaxAge: 600000,
    });
    remoteJwks.set(config.jwksUrl, jwks);
  }
  const { payload } = await jwtVerify(ticket, jwks, {
    issuer: config.issuer,
    audience,
    algorithms: ["RS256"],
    clockTolerance: 30,
  });
  return payload as Record<string, unknown>;
}

export async function verifyAdminStepUpTicketWithConfig(
  ticket: string,
  config: AdminStepUpVerifyConfig,
  audience: string
): Promise<AdminStepUpClaims> {
  let payload: Record<string, unknown>;
  try {
    payload = await verifySignature(ticket, config, audience);
  } catch {
    throw new AdminStepUpTicketError("INVALID_TICKET", "二次验证凭证无效或已过期");
  }

  if (
    payload.token_use !== "admin_step_up" ||
    payload.client_id !== config.clientId ||
    typeof payload.sub !== "string" ||
    typeof payload.state !== "string" ||
    typeof payload.action !== "string" ||
    typeof payload.resource_id !== "string" ||
    typeof payload.jti !== "string" ||
    typeof payload.ver !== "number" ||
    payload.totp !== true ||
    typeof payload.mainSessionExp !== "number" ||
    typeof payload.exp !== "number"
  ) {
    throw new AdminStepUpTicketError("INVALID_TICKET", "二次验证凭证字段无效");
  }
  if (payload.mainSessionExp * 1000 <= Date.now()) {
    throw new AdminStepUpTicketError("MAIN_SESSION_EXPIRED", "主站登录已过期，请重新登录");
  }

  return {
    sub: payload.sub,
    client_id: payload.client_id,
    state: payload.state,
    action: payload.action,
    resource_id: payload.resource_id,
    ver: payload.ver,
    totp: true,
    mainSessionExp: payload.mainSessionExp,
    jti: payload.jti,
    exp: payload.exp,
  };
}

export function stepUpClaimMismatch(
  claims: AdminStepUpClaims,
  request: StepUpRequestBinding,
  clientId: string,
  state: string
): StepUpClaimMismatch | null {
  if (claims.sub !== request.externalAdminId) return "admin";
  if (claims.client_id !== clientId) return "client";
  if (claims.state !== state) return "state";
  if (claims.action !== request.action) return "action";
  if (claims.resource_id !== request.resourceId) return "resource";
  return null;
}

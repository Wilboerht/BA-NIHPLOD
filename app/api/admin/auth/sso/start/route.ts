import { NextRequest, NextResponse } from "next/server";
import {
  ADMIN_SSO_COOKIE_OPTIONS,
  ADMIN_SSO_RETURN_COOKIE,
  ADMIN_SSO_STATE_COOKIE,
  ADMIN_SSO_VERIFIER_COOKIE,
  createPkcePair,
  createSsoState,
  getAdminSsoConfig,
} from "@/lib/admin-sso";
import { checkActionRateLimit } from "@/lib/db";
import { getClientIpFromRequest } from "@/lib/request-ip";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

function publicOrigin(request: NextRequest): string {
  return (process.env.NEXT_PUBLIC_BASE_URL || new URL(request.url).origin).replace(/\/+$/, "");
}

function safeReturnTo(value: string | null): string {
  if (!value) return "/workbench";
  if (value.startsWith("/workbench") && !value.startsWith("/workbench/../")) {
    return value;
  }
  return "/workbench";
}

function redirectToLogin(origin: string, code: string): NextResponse {
  return NextResponse.redirect(new URL(`/admin/login?error=${encodeURIComponent(code)}`, origin), {
    headers: { "Cache-Control": "no-store" },
  });
}

// GET /api/admin/auth/sso/start
// 生成 state + PKCE，302 到主站管理员授权端点。
export async function GET(request: NextRequest) {
  const origin = publicOrigin(request);
  const ip = getClientIpFromRequest(request);
  const allowed = await checkActionRateLimit(`admin-sso-start:${ip}`, 30, 60 * 1000).catch(
    () => false
  );
  if (!allowed) {
    return redirectToLogin(origin, "sso_rate_limited");
  }

  let config: ReturnType<typeof getAdminSsoConfig>;
  try {
    config = getAdminSsoConfig();
  } catch (error) {
    logger.error("[AdminSSO] 配置缺失", { error: String(error) });
    return redirectToLogin(origin, "sso_not_configured");
  }
  if (!config.enabled) {
    return redirectToLogin(origin, "sso_disabled");
  }

  const state = createSsoState();
  const { verifier, challenge } = createPkcePair();
  const returnTo = safeReturnTo(request.nextUrl.searchParams.get("return_to"));

  const authorizeUrl = new URL(config.authorizeUrl);
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("client_id", config.clientId);
  authorizeUrl.searchParams.set("redirect_uri", config.redirectUri);
  authorizeUrl.searchParams.set("state", state);
  authorizeUrl.searchParams.set("code_challenge", challenge);
  authorizeUrl.searchParams.set("code_challenge_method", "S256");

  const response = NextResponse.redirect(authorizeUrl, {
    headers: { "Cache-Control": "no-store" },
  });
  response.cookies.set(ADMIN_SSO_STATE_COOKIE, state, ADMIN_SSO_COOKIE_OPTIONS);
  response.cookies.set(ADMIN_SSO_VERIFIER_COOKIE, verifier, ADMIN_SSO_COOKIE_OPTIONS);
  response.cookies.set(ADMIN_SSO_RETURN_COOKIE, returnTo, ADMIN_SSO_COOKIE_OPTIONS);
  return response;
}

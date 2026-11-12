import { NextRequest, NextResponse } from "next/server";
import {
  ADMIN_SSO_COOKIE_OPTIONS,
  ADMIN_SSO_RETURN_COOKIE,
  ADMIN_SSO_STATE_COOKIE,
  ADMIN_SSO_VERIFIER_COOKIE,
  AdminSsoError,
  createSsoAdminSession,
  exchangeAdminSsoCode,
  getAdminSsoConfig,
  resolveLocalAdminRole,
  upsertShadowAdmin,
  verifyAdminSsoAssertion,
} from "@/lib/admin-sso";
import { sql, checkActionRateLimit } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { getClientIpFromRequest } from "@/lib/request-ip";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

// 生产环境必须显式配置 NEXT_PUBLIC_BASE_URL，避免 Host 头影响重定向目标
function publicOrigin(request: NextRequest): string | null {
  const configured = process.env.NEXT_PUBLIC_BASE_URL?.trim();
  if (configured) return configured.replace(/\/+$/, "");
  if (process.env.NODE_ENV === "production") return null;
  return new URL(request.url).origin.replace(/\/+$/, "");
}

function safeReturnTo(value: string | null | undefined): string {
  if (!value) return "/workbench";
  if (value.startsWith("/workbench") && !value.startsWith("/workbench/../")) {
    return value;
  }
  return "/workbench";
}

function clearSsoCookies(response: NextResponse): void {
  for (const name of [
    ADMIN_SSO_STATE_COOKIE,
    ADMIN_SSO_VERIFIER_COOKIE,
    ADMIN_SSO_RETURN_COOKIE,
  ]) {
    response.cookies.set(name, "", { ...ADMIN_SSO_COOKIE_OPTIONS, maxAge: 0 });
  }
}

function redirectToLogin(origin: string, code: string): NextResponse {
  const response = NextResponse.redirect(
    new URL(`/admin/login?error=${encodeURIComponent(code)}`, origin),
    { headers: { "Cache-Control": "no-store" } }
  );
  clearSsoCookies(response);
  return response;
}

// GET /api/admin/auth/sso/callback
// 校验 state/PKCE → 主站换断言 → 验签 → upsert 影子账号 → 返回本地会话。
export async function GET(request: NextRequest) {
  const origin = publicOrigin(request);
  if (!origin) {
    return NextResponse.json(
      { error: "sso_not_configured", message: "NEXT_PUBLIC_BASE_URL 未配置" },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
  const ip = getClientIpFromRequest(request);
  const allowed = await checkActionRateLimit(`admin-sso-callback:${ip}`, 30, 60 * 1000).catch(
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

  const params = request.nextUrl.searchParams;
  if (params.get("error")) {
    return redirectToLogin(origin, "sso_denied");
  }

  const code = params.get("code");
  const state = params.get("state");
  const expectedState = request.cookies.get(ADMIN_SSO_STATE_COOKIE)?.value;
  const verifier = request.cookies.get(ADMIN_SSO_VERIFIER_COOKIE)?.value;
  const returnTo = safeReturnTo(request.cookies.get(ADMIN_SSO_RETURN_COOKIE)?.value);

  if (!code || !state || !expectedState || !verifier || state !== expectedState) {
    return redirectToLogin(origin, "sso_state");
  }

  try {
    const assertion = await exchangeAdminSsoCode(code, verifier, config);
    const claims = await verifyAdminSsoAssertion(assertion, config);
    const localRole = resolveLocalAdminRole(claims);
    if (!localRole) {
      await writeAudit(sql, {
        action: "LOGIN_SSO_DENIED",
        targetType: "profile",
        comment: "主站管理员无 BA 权限",
        reason: "no_ba_access",
        request,
        after: { externalAdminId: claims.sub },
      }).catch(() => {});
      return redirectToLogin(origin, "sso_forbidden");
    }

    const shadow = await upsertShadowAdmin(claims, localRole);
    const session = await createSsoAdminSession(shadow, claims, config);

    const response = NextResponse.redirect(new URL(returnTo, origin), {
      headers: { "Cache-Control": "no-store" },
    });
    clearSsoCookies(response);
    response.headers.append("Set-Cookie", session.cookie);

    await writeAudit(sql, {
      actor: {
        id: shadow.id,
        role: shadow.role,
        name: shadow.full_name,
        source: "main",
        externalId: claims.sub,
      },
      action: "LOGIN_SSO",
      targetType: "profile",
      targetId: shadow.id,
      comment: `主站管理员 SSO 登录（${claims.email}）`,
      request,
      after: {
        externalAdminId: claims.sub,
        externalRole: claims.role,
        localRole,
        mainTotpEnabled: claims.totp,
      },
    }).catch((error) => logger.error("[AdminSSO] 审计写入失败", { error: String(error) }));

    return response;
  } catch (error) {
    if (error instanceof AdminSsoError) {
      logger.warn("[AdminSSO] callback failed", { code: error.code, status: error.status });
      const map: Record<string, string> = {
        MAIN_SESSION_EXPIRED: "sso_expired",
        TOKEN_ENDPOINT_UNREACHABLE: "sso_unreachable",
        TOTP_REQUIRED: "sso_totp_required",
        EMAIL_CONFLICT: "sso_conflict",
        INVALID_ASSERTION: "sso_failed",
        ASSERTION_REPLAYED: "sso_failed",
        TOKEN_EXCHANGE_FAILED: "sso_failed",
      };
      return redirectToLogin(origin, map[error.code] || "sso_failed");
    }
    logger.error("[AdminSSO] callback unexpected error", { error: String(error) });
    return redirectToLogin(origin, "sso_failed");
  }
}

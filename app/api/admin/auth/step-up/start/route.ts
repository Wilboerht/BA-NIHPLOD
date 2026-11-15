import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { getAdminSsoConfig } from "@/lib/admin-sso";
import {
  BA_STEP_UP_ACTIONS,
  isBaStepUpAction,
  stepUpAuditTarget,
  type BaStepUpAction,
} from "@/lib/certificate/step-up-actions";
import { hasCertificatePermission } from "@/lib/certificate/access";
import { createAdminStepUpRequest } from "@/lib/admin-step-up";
import { sql, checkActionRateLimit } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { isUuid } from "@/lib/validation";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

const FLOW_PATTERN = /^[A-Za-z0-9_-]{16,128}$/;

function jsonError(code: string, message: string, status: number) {
  return NextResponse.json(
    { success: false, error: { code, message } },
    { status, headers: { "Cache-Control": "no-store" } }
  );
}

function safeReturnTo(value: string | null): string {
  if (!value) return "/workbench/certificates";
  if (value.startsWith("/workbench") && !value.startsWith("//")) return value;
  return "/workbench/certificates";
}

/**
 * GET /api/admin/auth/step-up/start
 * BA 管理员发起高风险操作的 TOTP step-up，跳转主站完成验证。
 */
export async function GET(request: NextRequest) {
  const { user, response } = await requireAdmin(request);
  if (response) return response;
  if (!user) return jsonError("UNAUTHORIZED", "未登录", 401);
  if (user.auth_source !== "sso" || !user.external_admin_id) {
    return jsonError(
      "LOCAL_BREAK_GLASS_STEP_UP_UNSUPPORTED",
      "break-glass 应急账号不经过主站二次验证，请直接执行应急操作",
      409
    );
  }

  const params = request.nextUrl.searchParams;
  const action = params.get("action") || "";
  if (!isBaStepUpAction(action)) {
    return jsonError("INVALID_ACTION", "不支持的证书操作", 400);
  }
  const typedAction = action as BaStepUpAction;

  const resourceId = params.get("resource_id") || "";
  if (resourceId !== "new" && !isUuid(resourceId)) {
    return jsonError("INVALID_RESOURCE", "证书标识无效", 400);
  }
  if (resourceId === "new" && typedAction !== "ba.certificates.issue") {
    return jsonError("INVALID_RESOURCE", "只有证书核发可以使用 new 资源", 400);
  }
  if (!hasCertificatePermission(user, BA_STEP_UP_ACTIONS[typedAction])) {
    return jsonError("FORBIDDEN", "缺少该证书操作权限", 403);
  }

  const flowId = params.get("flow") || "";
  if (!FLOW_PATTERN.test(flowId)) {
    return jsonError("INVALID_FLOW", "验证流程无效，请重新操作", 400);
  }

  const allowed = await checkActionRateLimit(
    `admin-step-up-start:${user.id}`,
    10,
    60 * 1000
  );
  if (!allowed) {
    return jsonError("RATE_LIMITED", "操作过于频繁，请稍后再试", 429);
  }

  let config: ReturnType<typeof getAdminSsoConfig>;
  try {
    config = getAdminSsoConfig();
  } catch (error) {
    logger.error("[AdminStepUpStart] 配置缺失", { error: String(error) });
    return jsonError("SSO_NOT_CONFIGURED", "管理员 SSO 配置不完整", 500);
  }
  if (!config.enabled) {
    return jsonError("SSO_DISABLED", "管理员 SSO 未启用", 503);
  }

  const returnTo = safeReturnTo(params.get("return_to"));
  const redirectUri =
    process.env.ADMIN_SSO_STEP_UP_REDIRECT_URI?.trim() ||
    new URL("/api/admin/auth/step-up/callback", config.redirectUri).toString();

  try {
    const { state } = await createAdminStepUpRequest({
      profileId: user.id,
      externalAdminId: user.external_admin_id,
      action,
      resourceId,
      returnTo,
      flowId,
    });

    await writeAudit(sql, {
      actor: {
        id: user.id,
        role: user.role,
        name: user.full_name || user.username || "BA 管理员",
        source: "ba",
        externalId: user.external_admin_id,
      },
      action: "ADMIN_STEP_UP_REQUESTED",
      targetType: "certificate",
      ...stepUpAuditTarget(resourceId),
      comment: "BA 工作台发起高风险证书操作二次验证",
      after: { action: typedAction, flowId },
      request,
    }).catch(() => {});

    const stepUpUrl = new URL("/admin/sso/step-up", config.authorizeUrl);
    stepUpUrl.searchParams.set("client_id", config.clientId);
    stepUpUrl.searchParams.set("redirect_uri", redirectUri);
    stepUpUrl.searchParams.set("state", state);
    stepUpUrl.searchParams.set("action", action);
    stepUpUrl.searchParams.set("resource_id", resourceId);

    return NextResponse.redirect(stepUpUrl, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    logger.error("[AdminStepUpStart] 创建请求失败", { error: String(error) });
    return jsonError("INTERNAL_ERROR", "无法发起二次验证", 500);
  }
}


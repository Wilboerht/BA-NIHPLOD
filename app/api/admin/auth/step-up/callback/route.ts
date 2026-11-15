import { NextRequest, NextResponse } from "next/server";
import {
  ADMIN_STEP_UP_COOKIE_NAME,
  ADMIN_STEP_UP_COOKIE_OPTIONS,
  consumeAdminStepUpRequest,
  findAdminStepUpRequest,
  issueAdminStepUpGrant,
} from "@/lib/admin-step-up";
import { stepUpAuditTarget } from "@/lib/certificate/step-up-actions";
import { verifyAdminStepUpTicket, AdminStepUpTicketError } from "@/lib/admin-step-up-ticket";
import { getAdminSsoConfig } from "@/lib/admin-sso";
import { writeAudit } from "@/lib/audit";
import { getClientIpFromRequest } from "@/lib/request-ip";
import { sql, checkActionRateLimit } from "@/lib/db";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 16 * 1024;

function completionUrl(params: {
  flowId?: string;
  action?: string;
  resourceId?: string;
  returnTo?: string;
  error?: string;
}): URL {
  const url = new URL("/admin/step-up/complete", process.env.NEXT_PUBLIC_BASE_URL || "https://ba.nihplod.cn");
  if (params.flowId) url.searchParams.set("flow", params.flowId);
  if (params.action) url.searchParams.set("action", params.action);
  if (params.resourceId) url.searchParams.set("resource_id", params.resourceId);
  if (params.returnTo) url.searchParams.set("return_to", params.returnTo);
  if (params.error) url.searchParams.set("error", params.error);
  return url;
}

function redirectWithGrant(token: string, location: URL): NextResponse {
  const response = NextResponse.redirect(location, { status: 303 });
  response.cookies.set(ADMIN_STEP_UP_COOKIE_NAME, token, ADMIN_STEP_UP_COOKIE_OPTIONS);
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}

/**
 * POST /api/admin/auth/step-up/callback
 * 主站 step-up 页面把一次性 ticket POST 回来；校验后写入 BA 本地一次性 grant。
 */
export async function POST(request: NextRequest) {
  const ip = getClientIpFromRequest(request);
  const limitOk = await checkActionRateLimit(`admin-step-up-callback:${ip}`, 30, 60 * 1000);
  if (!limitOk) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  if (rawBody.length > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "Body too large" }, { status: 413 });
  }

  const form = new URLSearchParams(rawBody);
  const ticket = form.get("ticket") || "";
  const state = form.get("state") || "";
  if (!ticket || !state || state.length > 128) {
    return NextResponse.json({ error: "Missing ticket or state" }, { status: 400 });
  }

  let t: Response;
  try {
    t = await handleCallback({ ticket, state, request, ip });
    return t;
  } catch (error) {
    logger.error("[AdminStepUpCallback] failed", { error: String(error) });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

async function handleCallback(params: {
  ticket: string;
  state: string;
  request: NextRequest;
  ip: string;
}): Promise<NextResponse> {
  const { ticket, state, request, ip } = params;
  const requestRow = await findAdminStepUpRequest(state);
  if (!requestRow || requestRow.consumedAt || requestRow.expiresAt <= new Date()) {
    return NextResponse.redirect(
      completionUrl({
        flowId: requestRow?.flowId,
        error: "step_up_state_expired",
      }),
      { status: 303 }
    );
  }

  let claims;
  try {
    claims = await verifyAdminStepUpTicket(ticket);
  } catch (error) {
    if (error instanceof AdminStepUpTicketError) {
      await writeAudit(sql, {
        actor: { source: "system" },
        action: "ADMIN_STEP_UP_REJECTED",
        targetType: "certificate",
        ...stepUpAuditTarget(requestRow.resourceId),
        comment: "BA 高风险操作二次验证被拒绝",
        reason: error.code,
        request,
      }).catch(() => {});
      return NextResponse.redirect(
        completionUrl({ flowId: requestRow.flowId, error: error.code.toLowerCase() }),
        { status: 303 }
      );
    }
    throw error;
  }

  if (
    claims.sub !== requestRow.externalAdminId ||
    claims.client_id !== getAdminSsoConfig().clientId ||
    claims.state !== state ||
    claims.action !== requestRow.action ||
    claims.resource_id !== requestRow.resourceId
  ) {
    await writeAudit(sql, {
      actor: { source: "system" },
      action: "ADMIN_STEP_UP_REJECTED",
      targetType: "certificate",
      ...stepUpAuditTarget(requestRow.resourceId),
      comment: "BA 高风险操作二次验证绑定信息不匹配",
      reason: "claim_mismatch",
      request,
    }).catch(() => {});
    return NextResponse.redirect(
      completionUrl({ flowId: requestRow.flowId, error: "step_up_claim_mismatch" }),
      { status: 303 }
    );
  }

  if (!(await consumeAdminStepUpRequest(requestRow.id))) {
    return NextResponse.redirect(
      completionUrl({ flowId: requestRow.flowId, error: "step_up_state_expired" }),
      { status: 303 }
    );
  }

  const grant = await issueAdminStepUpGrant({
    ticketJti: claims.jti,
    profileId: requestRow.profileId,
    externalAdminId: requestRow.externalAdminId,
    action: requestRow.action,
    resourceId: requestRow.resourceId,
  });

  await writeAudit(sql, {
    actor: {
      id: requestRow.profileId,
      role: "AUDITOR",
      name: requestRow.externalAdminId,
      source: "main",
      externalId: requestRow.externalAdminId,
    },
    action: "ADMIN_STEP_UP_GRANTED",
    targetType: "certificate",
    ...stepUpAuditTarget(requestRow.resourceId),
    comment: "BA 高风险操作二次验证通过",
    after: { action: requestRow.action, flowId: requestRow.flowId, ip },
    request,
  }).catch(() => {});

  return redirectWithGrant(
    grant.token,
    completionUrl({
      flowId: requestRow.flowId,
      action: requestRow.action,
      resourceId: requestRow.resourceId,
      returnTo: requestRow.returnTo,
    })
  );
}






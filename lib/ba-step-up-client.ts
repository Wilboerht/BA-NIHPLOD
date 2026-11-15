"use client";

interface StepUpRequiredBody {
  code?: string;
  action?: string;
  resourceId?: string;
}

function newFlowId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random()
    .toString(36)
    .slice(2)}`;
}

function currentReturnTo(): string {
  if (typeof window === "undefined") return "/workbench/certificates";
  const path = `${window.location.pathname}${window.location.search}`;
  return path.startsWith("/workbench") ? path : "/workbench/certificates";
}

async function openStepUpWindow(
  action: string,
  resourceId: string,
  flowId: string
): Promise<boolean> {
  const startUrl = new URL("/api/admin/auth/step-up/start", window.location.origin);
  startUrl.searchParams.set("action", action);
  startUrl.searchParams.set("resource_id", resourceId);
  startUrl.searchParams.set("return_to", currentReturnTo());
  startUrl.searchParams.set("flow", flowId);

  const popup = window.open(
    startUrl.toString(),
    "ba-certificate-step-up",
    "popup=yes,width=560,height=720"
  );
  if (!popup) {
    window.location.href = startUrl.toString();
    return false;
  }

  return new Promise<boolean>((resolve, reject) => {
    let settled = false;
    const finish = (ok: boolean, message?: string) => {
      if (settled) return;
      settled = true;
      window.removeEventListener("message", onMessage);
      window.clearInterval(closedTimer);
      window.clearTimeout(timeout);
      if (ok) resolve(true);
      else reject(new Error(message || "二次验证失败"));
    };
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      const data = event.data as
        | { type?: string; flow?: string; error?: string | null }
        | null;
      if (data?.type !== "ba:certificate-step-up-complete" || data.flow !== flowId) {
        return;
      }
      if (data.error) {
        finish(false, `二次验证未通过：${data.error}`);
        return;
      }
      finish(true);
    };
    const closedTimer = window.setInterval(() => {
      if (popup.closed) finish(false, "二次验证窗口已关闭");
    }, 500);
    const timeout = window.setTimeout(
      () => finish(false, "二次验证超时，请重试"),
      5 * 60 * 1000
    );
    window.addEventListener("message", onMessage);
  });
}

/**
 * 执行证书高风险操作；遇到 428 STEP_UP_REQUIRED 时打开主站 TOTP 弹窗，
 * 验证完成后自动重试原请求。popup 被拦截时回退整页跳转。
 */
export async function withBaCertificateStepUp(
  action: string,
  resourceId: string,
  run: () => Promise<Response>
): Promise<Response> {
  const response = await run();
  if (response.status !== 428) return response;

  let body: StepUpRequiredBody | null = null;
  try {
    body = (await response.clone().json()) as StepUpRequiredBody;
  } catch {
    // fall through
  }
  if (body?.code !== "STEP_UP_REQUIRED") return response;

  const effectiveAction = body.action || action;
  const effectiveResource = body.resourceId || resourceId;
  const flowId = newFlowId();
  const completed = await openStepUpWindow(effectiveAction, effectiveResource, flowId);
  if (!completed) {
    throw new Error("请在二次验证完成后重新执行该操作");
  }
  return run();
}

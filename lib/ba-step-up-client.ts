"use client";

interface StepUpRequiredBody {
  code?: string;
  action?: string;
  resourceId?: string;
}

const STEP_UP_WINDOW_NAME = "ba-certificate-step-up";
const STEP_UP_WINDOW_FEATURES = "popup=yes,width=560,height=720";

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

function currentStepUpMode(): string | undefined {
  if (typeof document === "undefined") return undefined;
  return document.documentElement.dataset.baStepUpMode;
}

function openStepUpPopup(): Window | null {
  if (typeof window === "undefined") return null;
  try {
    return window.open("about:blank", STEP_UP_WINDOW_NAME, STEP_UP_WINDOW_FEATURES);
  } catch {
    return null;
  }
}

function stepUpStartUrl(action: string, resourceId: string, flowId: string): URL {
  const startUrl = new URL("/api/admin/auth/step-up/start", window.location.origin);
  startUrl.searchParams.set("action", action);
  startUrl.searchParams.set("resource_id", resourceId);
  startUrl.searchParams.set("return_to", currentReturnTo());
  startUrl.searchParams.set("flow", flowId);
  return startUrl;
}

function waitForStepUp(popup: Window, flowId: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    let settled = false;
    const finish = (ok: boolean, message?: string) => {
      if (settled) return;
      settled = true;
      window.removeEventListener("message", onMessage);
      window.clearInterval(closedTimer);
      window.clearTimeout(timeout);
      if (ok) resolve();
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

export async function withBaCertificateStepUp(
  action: string,
  resourceId: string,
  run: () => Promise<Response>
): Promise<Response> {
  const preopened =
    currentStepUpMode() === "enforce" ? openStepUpPopup() : null;

  let response: Response;
  try {
    response = await run();
  } catch (error) {
    preopened?.close();
    throw error;
  }

  if (response.status !== 428) {
    preopened?.close();
    return response;
  }

  let body: StepUpRequiredBody | null = null;
  try {
    body = (await response.clone().json()) as StepUpRequiredBody;
  } catch {
    body = null;
  }
  if (body?.code !== "STEP_UP_REQUIRED") {
    preopened?.close();
    return response;
  }

  const effectiveAction = body.action || action;
  const effectiveResource = body.resourceId || resourceId;
  const flowId = newFlowId();
  const startUrl = stepUpStartUrl(effectiveAction, effectiveResource, flowId);

  const popup = preopened && !preopened.closed ? preopened : openStepUpPopup();
  if (!popup) {
    preopened?.close();
    throw new Error("浏览器拦截了二次验证窗口，请允许本站弹窗后重试");
  }

  popup.location.href = startUrl.toString();
  try {
    await waitForStepUp(popup, flowId);
  } catch (error) {
    if (!popup.closed) popup.close();
    throw error;
  }
  return run();
}

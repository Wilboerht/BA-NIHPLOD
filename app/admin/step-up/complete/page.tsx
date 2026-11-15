"use client";

import { Suspense, useEffect } from "react";
import { useSearchParams } from "next/navigation";

function StepUpCompleteContent() {
  const params = useSearchParams();
  const flow = params.get("flow") || "";
  const action = params.get("action") || "";
  const resourceId = params.get("resource_id") || "";
  const error = params.get("error") || "";
  const returnToRaw = params.get("return_to") || "/workbench/certificates";
  const returnTo = returnToRaw.startsWith("/workbench") ? returnToRaw : "/workbench/certificates";

  useEffect(() => {
    const payload = {
      type: "ba:certificate-step-up-complete",
      flow,
      action,
      resourceId,
      error: error || null,
    };
    if (window.opener && !window.opener.closed) {
      window.opener.postMessage(payload, window.location.origin);
      window.close();
      return;
    }
    window.location.replace(returnTo);
  }, [action, error, flow, resourceId, returnTo]);

  return (
    <div className="flex min-h-dvh items-center justify-center bg-brand-cream px-4">
      <div className="max-w-sm rounded-2xl border border-brand-charcoal/10 bg-white p-6 text-center shadow-sm">
        <h1 className="text-lg font-semibold text-brand-charcoal">二次验证完成</h1>
        <p className="mt-2 text-sm text-brand-charcoal/65">正在返回管理后台…</p>
        {error && <p className="mt-2 text-xs text-red-600">验证未通过：{error}</p>}
        <a href={returnTo} className="mt-4 inline-block text-sm text-brand-primary hover:underline">
          返回工作台
        </a>
      </div>
    </div>
  );
}

export default function AdminStepUpCompletePage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-dvh items-center justify-center bg-brand-cream text-sm text-brand-charcoal/65">
          正在返回管理后台…
        </div>
      }
    >
      <StepUpCompleteContent />
    </Suspense>
  );
}


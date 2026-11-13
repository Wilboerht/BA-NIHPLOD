import { NextResponse } from "next/server";
import { authenticateInternalApi } from "@/lib/internal-auth";
import {
  InternalActorError,
  parseInternalActorPayload,
  readInternalActorFromRequest,
  resolveInternalActor,
  type ResolvedInternalActor,
} from "@/lib/internal-actor";

export async function authenticateCertificateRequest(
  request: Request,
  path: string,
  method: string,
  requiredCapability?: string,
  maxBytes = 1024 * 1024,
): Promise<
  | {
      ok: true;
      actor: ResolvedInternalActor;
      body: Record<string, unknown>;
      bodyText: string;
    }
  | { ok: false; response: NextResponse }
> {
  const auth = await authenticateInternalApi(
    request,
    path,
    method,
    ["ba"],
    maxBytes,
  );
  if (!auth.ok) return auth;

  let body: Record<string, unknown> = {};
  if (auth.bodyText) {
    try {
      const parsed = JSON.parse(auth.bodyText) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        body = parsed as Record<string, unknown>;
      }
    } catch {
      return {
        ok: false,
        response: NextResponse.json(
          {
            success: false,
            error: { code: "INVALID_JSON", message: "请求体不是合法 JSON" },
          },
          { status: 400 },
        ),
      };
    }
  }

  const actorInput =
    parseInternalActorPayload(body.actor) ??
    readInternalActorFromRequest(request);
  try {
    const actor = await resolveInternalActor(actorInput, requiredCapability);
    return { ok: true, actor, body, bodyText: auth.bodyText };
  } catch (error) {
    if (error instanceof InternalActorError) {
      return {
        ok: false,
        response: NextResponse.json(
          {
            success: false,
            error: { code: error.code, message: error.message },
          },
          { status: error.status },
        ),
      };
    }
    throw error;
  }
}

export function certificateErrorResponse(error: unknown): NextResponse {
  if (error instanceof InternalActorError) {
    return NextResponse.json(
      { success: false, error: { code: error.code, message: error.message } },
      { status: error.status },
    );
  }
  if (
    error &&
    typeof error === "object" &&
    "code" in error &&
    "status" in error
  ) {
    const code = String((error as { code: unknown }).code);
    const status = Number((error as { status: unknown }).status);
    const message = error instanceof Error ? error.message : "证书操作失败";
    return NextResponse.json(
      { success: false, error: { code, message } },
      { status: Number.isFinite(status) && status >= 400 ? status : 400 },
    );
  }
  console.error("[InternalCertificates] failed", error);
  return NextResponse.json(
    {
      success: false,
      error: { code: "INTERNAL_ERROR", message: "证书操作失败" },
    },
    { status: 500 },
  );
}

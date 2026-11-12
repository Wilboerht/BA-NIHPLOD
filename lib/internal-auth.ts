import { NextResponse } from "next/server";
import {
  canonicalizeQuery,
  checkAndRecordNonce,
  hashRequestBody,
  isProjectAllowed,
  isTimestampValid,
  readInternalApiBody,
  verifyInternalApiSignature,
  type InternalApiKeyConfig,
} from "@/lib/internal-api";

type AuthResult =
  | { ok: true; config: InternalApiKeyConfig; bodyText: string }
  | { ok: false; response: NextResponse };

function error(code: string, message: string, status: number): NextResponse {
  return NextResponse.json(
    { success: false, error: { code, message } },
    { status, headers: { "Cache-Control": "no-store" } }
  );
}

export async function authenticateInternalApi(
  request: Request,
  path: string,
  method: string,
  allowedProjects: readonly string[]
): Promise<AuthResult> {
  const key = request.headers.get("x-internal-api-key");
  const signature = request.headers.get("x-internal-api-signature");
  const timestampHeader = request.headers.get("x-internal-api-timestamp");
  const nonce = request.headers.get("x-internal-api-nonce");
  if (!key || !signature || !timestampHeader || !nonce) {
    return { ok: false, response: error("MISSING_AUTH", "缺少鉴权头", 401) };
  }

  const timestamp = parseInt(timestampHeader, 10);
  if (Number.isNaN(timestamp) || !isTimestampValid(timestamp)) {
    return { ok: false, response: error("INVALID_TIMESTAMP", "请求时间戳无效或已过期", 401) };
  }

  let bodyText = "";
  if (method !== "GET" && method !== "HEAD") {
    try {
      bodyText = await readInternalApiBody(request);
    } catch {
      return { ok: false, response: error("INVALID_REQUEST", "请求体读取失败", 400) };
    }
  }

  const config = verifyInternalApiSignature(
    key,
    signature,
    method,
    path,
    timestamp,
    nonce,
    hashRequestBody(bodyText),
    canonicalizeQuery(new URL(request.url).search)
  );
  if (!config) {
    return { ok: false, response: error("UNAUTHORIZED", "签名验证失败", 401) };
  }
  if (!isProjectAllowed(config, allowedProjects)) {
    return { ok: false, response: error("FORBIDDEN_PROJECT", "该项目无权访问此端点", 403) };
  }
  if (!checkAndRecordNonce(nonce)) {
    return { ok: false, response: error("REPLAY_ATTACK", "重复请求 nonce", 401) };
  }

  return { ok: true, config, bodyText };
}

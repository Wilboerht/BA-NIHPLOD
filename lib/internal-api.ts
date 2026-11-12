/**
 * BA 内部 API 验签
 *
 * 与主站 /api/v1/internal/* 使用相同签名格式：
 * HMAC-SHA256(secret, "METHOD|path|canonicalQuery|timestamp|nonce|bodySha256")
 *
 * BA 为单实例，nonce 使用进程内 TTL 缓存；未来多实例需迁移到 Redis/DB。
 */
import { createHash, createHmac, randomBytes, timingSafeEqual } from "crypto";

const TIMESTAMP_TOLERANCE_SECONDS = 300;
const MIN_SECRET_LENGTH = 32;
const NONCE_TTL_MS = 10 * 60 * 1000;

export interface InternalApiKeyConfig {
  project: string;
  key: string;
  secret: string;
  previousSecrets?: string[];
}

interface ParsedKeys {
  keys: Map<string, InternalApiKeyConfig>;
}

let cachedParsedKeys: ParsedKeys | null = null;
let lastEnvValue: string | undefined;

export function getInternalApiKeys(): ParsedKeys {
  const envValue = process.env.INTERNAL_API_KEYS;
  if (envValue === lastEnvValue && cachedParsedKeys) return cachedParsedKeys;

  const keys = new Map<string, InternalApiKeyConfig>();
  if (envValue) {
    try {
      const parsed = JSON.parse(envValue) as InternalApiKeyConfig[];
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          if (!item?.project || !item?.key || !item?.secret) continue;
          if (item.secret.length < MIN_SECRET_LENGTH) continue;
          const previousSecrets = Array.isArray(item.previousSecrets)
            ? item.previousSecrets.filter(
                (secret): secret is string =>
                  typeof secret === "string" && secret.length >= MIN_SECRET_LENGTH
              )
            : undefined;
          keys.set(item.key, { ...item, previousSecrets });
        }
      }
    } catch {
      // 解析失败按未配置处理
    }
  }
  cachedParsedKeys = { keys };
  lastEnvValue = envValue;
  return cachedParsedKeys;
}

export function canonicalizeQuery(search: string): string {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const pairs: [string, string][] = [];
  for (const [key, value] of params.entries()) pairs.push([key, value]);
  pairs.sort((a, b) => {
    if (a[0] !== b[0]) return a[0] < b[0] ? -1 : 1;
    if (a[1] !== b[1]) return a[1] < b[1] ? -1 : 1;
    return 0;
  });
  return pairs
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join("&");
}

export function hashRequestBody(body: string): string {
  return createHash("sha256").update(body).digest("hex");
}

export function generateInternalApiSignature(
  secret: string,
  method: string,
  path: string,
  timestamp: number,
  nonce: string,
  bodyHash: string,
  query: string
): string {
  return createHmac("sha256", secret)
    .update(`${method.toUpperCase()}|${path}|${query}|${timestamp}|${nonce}|${bodyHash}`)
    .digest("hex");
}

export function verifyInternalApiSignature(
  key: string,
  signature: string,
  method: string,
  path: string,
  timestamp: number,
  nonce: string,
  bodyHash: string,
  query: string
): InternalApiKeyConfig | null {
  const config = getInternalApiKeys().keys.get(key);
  if (!config) return null;

  const secrets = [config.secret, ...(config.previousSecrets ?? [])];
  let provided: Buffer;
  try {
    provided = Buffer.from(signature, "hex");
  } catch {
    return null;
  }

  for (const secret of secrets) {
    const expected = Buffer.from(
      generateInternalApiSignature(secret, method, path, timestamp, nonce, bodyHash, query),
      "hex"
    );
    if (provided.length === expected.length && timingSafeEqual(provided, expected)) {
      return config;
    }
  }
  return null;
}

export function isTimestampValid(timestamp: number): boolean {
  const now = Math.floor(Date.now() / 1000);
  return Math.abs(now - timestamp) <= TIMESTAMP_TOLERANCE_SECONDS;
}

const nonceCache = new Map<string, number>();

export function checkAndRecordNonce(nonce: string): boolean {
  const now = Date.now();
  for (const [key, expiresAt] of nonceCache) {
    if (expiresAt <= now) nonceCache.delete(key);
  }
  if (nonceCache.has(nonce)) return false;
  nonceCache.set(nonce, now + NONCE_TTL_MS);
  return true;
}

export function isProjectAllowed(
  config: InternalApiKeyConfig,
  allowedProjects: readonly string[]
): boolean {
  return allowedProjects.includes(config.project);
}

/**
 * BA 出站签名：使用 INTERNAL_API_KEYS 中 project=ba 的 key/secret。
 */
export function createSignedInternalRequestHeaders(
  project: string,
  method: string,
  path: string,
  bodyText = "",
  query = ""
): Record<string, string> | null {
  const config = [...getInternalApiKeys().keys.values()].find(
    (item) => item.project === project
  );
  if (!config) return null;

  const timestamp = Math.floor(Date.now() / 1000);
  const nonce = randomBytes(16).toString("hex");
  const signature = generateInternalApiSignature(
    config.secret,
    method,
    path,
    timestamp,
    nonce,
    hashRequestBody(bodyText),
    canonicalizeQuery(query)
  );
  return {
    "X-Internal-API-Key": config.key,
    "X-Internal-API-Timestamp": String(timestamp),
    "X-Internal-API-Nonce": nonce,
    "X-Internal-API-Signature": signature,
  };
}

export async function readInternalApiBody(
  request: Request,
  maxBytes = 1024 * 1024
): Promise<string> {
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    throw new Error("BODY_TOO_LARGE");
  }
  const text = await request.text();
  if (Buffer.byteLength(text, "utf8") > maxBytes) {
    throw new Error("BODY_TOO_LARGE");
  }
  return text;
}

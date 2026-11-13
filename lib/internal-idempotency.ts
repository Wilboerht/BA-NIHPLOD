import crypto from "crypto";
import { sql } from "@/lib/db";

export interface IdempotentResponse<T> {
  status: number;
  body: T;
  replayed?: boolean;
}

function hashRequest(value: unknown): string {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(value))
    .digest("hex");
}

export function readIdempotencyKey(
  request: Request,
  bodyKey?: unknown,
): string | null {
  const header = request.headers.get("x-idempotency-key");
  const key = header || (typeof bodyKey === "string" ? bodyKey : "");
  if (!key) return null;
  return key.slice(0, 128);
}

export async function runIdempotent<T>(
  options: {
    key: string | null;
    project: string;
    action: string;
    actorExternalId: string;
    request: unknown;
  },
  run: () => Promise<IdempotentResponse<T>>,
): Promise<IdempotentResponse<T>> {
  if (!options.key) return run();

  const requestHash = hashRequest(options.request);
  return sql.begin(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(hashtext(${`idempotency:${options.project}:${options.key}`}))`;

    const existing = await tx`
      SELECT request_hash, response_code, response_body
      FROM internal_request_idempotency
      WHERE key = ${options.key}
      LIMIT 1
    `;
    if (existing.length > 0) {
      const row = existing[0];
      if (String(row.request_hash) !== requestHash) {
        return {
          status: 409,
          body: {
            success: false,
            error: {
              code: "IDEMPOTENCY_CONFLICT",
              message: "相同幂等键对应了不同请求",
            },
          } as T,
        };
      }
      return {
        status: Number(row.response_code),
        body: row.response_body as T,
        replayed: true,
      };
    }

    const result = await run();
    await tx`
      INSERT INTO internal_request_idempotency (
        key, project, action, actor_external_id, request_hash,
        response_code, response_body, created_at, expires_at
      ) VALUES (
        ${options.key}, ${options.project}, ${options.action}, ${options.actorExternalId},
        ${requestHash}, ${result.status}, ${JSON.stringify(result.body)}::jsonb,
        NOW(), NOW() + INTERVAL '24 hours'
      )
    `;
    return result;
  });
}

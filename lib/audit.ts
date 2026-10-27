import crypto from 'crypto';
import { headers } from 'next/headers';
import type { TransactionSql } from 'postgres';
import { sql } from './db';

type SqlLike = TransactionSql | typeof sql;

export type AuditTargetType = 'certificate' | 'complaint' | 'profile' | 'file' | 'system';

export interface AuditActor {
  id?: string | null;
  role?: string | null;
  name?: string | null;
}

export interface AuditEvent {
  actor?: AuditActor;
  action: string;
  targetType?: AuditTargetType | null;
  targetId?: string | null;
  targetRef?: string | null;
  certificateId?: string | null;
  certificateRef?: string | null;
  complaintId?: string | null;
  complaintRef?: string | null;
  comment?: string | null;
  reason?: string | null;
  before?: unknown;
  after?: unknown;
  request?: Request;
}

interface RequestMeta {
  ip: string | null;
  userAgent: string | null;
  requestId: string;
}

function firstHeader(value: string | null, maxLength: number): string | null {
  if (!value) return null;
  const first = value.split(',')[0]?.trim();
  return first ? first.slice(0, maxLength) : null;
}

export async function getRequestMeta(request?: Request): Promise<RequestMeta> {
  let ip: string | null = null;
  let userAgent: string | null = null;
  let requestId: string | null = null;

  if (request) {
    ip = firstHeader(request.headers.get('x-real-ip'), 64)
      ?? firstHeader(request.headers.get('x-forwarded-for'), 64);
    userAgent = firstHeader(request.headers.get('user-agent'), 500);
    requestId = firstHeader(request.headers.get('x-request-id'), 100);
  } else {
    try {
      const h = await headers();
      ip = firstHeader(h.get('x-real-ip'), 64)
        ?? firstHeader(h.get('x-forwarded-for'), 64);
      userAgent = firstHeader(h.get('user-agent'), 500);
      requestId = firstHeader(h.get('x-request-id'), 100);
    } catch {
      // 非请求上下文（worker/cron 直连）没有 headers
    }
  }

  return {
    ip,
    userAgent,
    requestId: requestId || crypto.randomUUID(),
  };
}

function toJson(value: unknown): string | null {
  if (value === undefined) return null;
  try {
    return JSON.stringify(value);
  } catch {
    return JSON.stringify({ error: 'unserializable audit payload' });
  }
}

/**
 * 写入审计事件。
 *
 * 关键业务操作应传入事务 tx，保证业务变更与审计写入同事务；
 * 非关键事件（登录失败、上传等）可以直接传 sql。
 */
export async function writeAudit(db: SqlLike, event: AuditEvent): Promise<void> {
  const meta = await getRequestMeta(event.request);
  const occurredAt = new Date();
  const before = toJson(event.before);
  const after = toJson(event.after);

  const actorId = event.actor?.id ?? null;
  const actorRole = event.actor?.role ?? null;
  const actorName = event.actor?.name ?? null;

  const certificateId = event.certificateId
    ?? (event.targetType === 'certificate' ? event.targetId ?? null : null);
  const certificateRef = event.certificateRef
    ?? (event.targetType === 'certificate' ? event.targetRef ?? event.targetId ?? null : null);
  const complaintId = event.complaintId
    ?? (event.targetType === 'complaint' ? event.targetId ?? null : null);
  const complaintRef = event.complaintRef
    ?? (event.targetType === 'complaint' ? event.targetRef ?? event.targetId ?? null : null);

  const eventHash = crypto
    .createHash('sha256')
    .update(JSON.stringify({
      action: event.action,
      targetType: event.targetType ?? null,
      targetId: event.targetId ?? null,
      targetRef: event.targetRef ?? null,
      actorId,
      actorRole,
      actorName,
      comment: event.comment ?? null,
      reason: event.reason ?? null,
      before: event.before ?? null,
      after: event.after ?? null,
      requestId: meta.requestId,
      occurredAt: occurredAt.toISOString(),
    }))
    .digest('hex');

  const run = db as unknown as typeof sql;

  await run`
    INSERT INTO audit_logs (
      certificate_id, certificate_ref, complaint_id, complaint_ref,
      actor_id, actor_role, actor_name,
      action, comment, reason,
      target_type, target_id, target_ref, request_id, ip, user_agent,
      "before", "after", event_hash, created_at
    ) VALUES (
      ${certificateId}, ${certificateRef}, ${complaintId}, ${complaintRef},
      ${actorId}, ${actorRole}, ${actorName},
      ${event.action}, ${event.comment ?? null}, ${event.reason ?? null},
      ${event.targetType ?? null}, ${event.targetId ?? null}, ${event.targetRef ?? null},
      ${meta.requestId}, ${meta.ip}, ${meta.userAgent},
      ${before}, ${after}, ${eventHash}, ${occurredAt}
    )
  `;
}

export function actorFromUser(user: {
  id?: string;
  role?: string;
  full_name?: string;
  username?: string;
} | null | undefined): AuditActor {
  return {
    id: user?.id ?? null,
    role: user?.role ?? null,
    name: user?.full_name || user?.username || null,
  };
}

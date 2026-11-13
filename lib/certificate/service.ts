import crypto from "crypto";
import type { TransactionSql } from "postgres";
import { sql } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { COMPANY_FULL_NAME } from "@/lib/config";
import { formatDateISO, parseAuthScope } from "@/lib/utils";
import {
  buildContainsPattern,
  getTodayISO,
  isUuid,
  parseDateOnly,
} from "@/lib/validation";
import {
  CERTIFICATE_TEMPLATE_VERSION,
  type CertificateVariant,
} from "./render";
import {
  certificateVariantForStatus,
  contentTypeForFormat,
  deleteArtifact,
  readArtifact,
  renderAndStoreArtifact,
  type CertificateFormat,
} from "./artifacts";
import type { ResolvedInternalActor } from "@/lib/internal-actor";

export const CERTIFICATE_CHANNELS = [
  "淘宝",
  "天猫",
  "京东",
  "小红书",
  "抖音",
  "微信",
  "线下门店",
  "其他",
] as const;

const DEFAULT_SCOPE_TEXT = `予以下渠道：

运营我司代理的品牌 NIHPLOD (旎柏)
全系列产品的 [合格经销资格]
负责该品牌产品在上述相关渠道的商务推广及售后服务`;

export interface CertificateDraft {
  companyName: string;
  shopName: string;
  phone?: string;
  scopeText: string;
  duration?: string;
  startDate?: string;
  endDate?: string;
  sealImage?: string | null;
}

export interface CertificateListItem {
  id: string;
  certNumber: string;
  status: string;
  displayStatus: string;
  companyName: string;
  shopName: string;
  scopeText: string;
  authorizer: string;
  phoneMasked: string | null;
  startDate: string;
  endDate: string;
  auditorName: string | null;
  createdAt: string;
  updatedAt: string;
  artifact: { pngReady: boolean; pdfReady: boolean };
  allowedActions: Record<string, boolean>;
}

class CertificateServiceError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

function fail(code: string, message: string, status = 400): never {
  throw new CertificateServiceError(code, message, status);
}

function actorAudit(actor: ResolvedInternalActor) {
  return {
    id: actor.profileId,
    role: actor.role,
    name: actor.name,
    source: "main" as const,
    externalId: actor.externalAdminId,
  };
}

function hasCapability(
  actor: ResolvedInternalActor,
  capability: string,
): boolean {
  return actor.capabilities.has(capability);
}

function requireCapability(
  actor: ResolvedInternalActor,
  capability: string,
): void {
  if (!hasCapability(actor, capability))
    fail("FORBIDDEN", "缺少证书操作权限", 403);
}

function isAllowedSealUrl(url: string | null | undefined): boolean {
  if (!url) return true;
  if (url.length > 512 || url.includes("..")) return false;
  return (
    url === "/default-seal.png" ||
    (url.startsWith("/uploads/") && /\.(png|jpe?g|webp)$/i.test(url))
  );
}

function parseDraft(input: CertificateDraft): {
  companyName: string;
  shopName: string;
  phone: string | null;
  scopeText: string;
  startDate: string;
  endDate: string;
  sealImage: string | null;
} {
  const companyName = String(input.companyName ?? "").trim();
  const shopName = String(input.shopName ?? "").trim();
  const scopeText = String(input.scopeText ?? "").trim();
  const phone = input.phone?.trim() || null;
  if (!companyName || companyName.length > 200)
    fail("INVALID_COMPANY", "公司名称无效");
  if (!shopName || shopName.length > 200)
    fail("INVALID_SHOP", "店铺/平台名称无效");
  if (!scopeText || scopeText.length > 1000)
    fail("INVALID_SCOPE", "授权范围无效");
  if (phone && phone.length > 20) fail("INVALID_PHONE", "手机号格式无效");
  if (!isAllowedSealUrl(input.sealImage)) fail("INVALID_SEAL", "签章来源无效");

  let startDate = input.startDate?.trim() ?? "";
  let endDate = input.endDate?.trim() ?? "";
  if ((!startDate || !endDate) && input.duration) {
    const parts = input.duration.split(" - ");
    if (parts.length !== 2) fail("INVALID_DURATION", "有效期格式无效");
    startDate = parts[0].replace(/\./g, "-").trim();
    endDate = parts[1].replace(/\./g, "-").trim();
  }
  const start = parseDateOnly(startDate);
  const end = parseDateOnly(endDate);
  if (!start || !end) fail("INVALID_DURATION", "有效期日期无效");
  if (start.iso > end.iso) fail("INVALID_DURATION", "结束日期不能早于开始日期");
  if (end.iso < getTodayISO()) fail("INVALID_DURATION", "不能签发已过期的证书");

  return {
    companyName,
    shopName,
    phone,
    scopeText,
    startDate: start.iso,
    endDate: end.iso,
    sealImage: input.sealImage || null,
  };
}

function buildAuthScope(companyName: string, scopeText: string): string {
  return `${companyName.replace(/\s*\|\s*/g, " ").trim()} | ${scopeText} | ${COMPANY_FULL_NAME}`;
}

async function generateCertNumber(): Promise<string> {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const number = `BAVP-${new Date().getFullYear()}-${crypto.randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase()}`;
    const rows =
      await sql`SELECT id FROM certificates WHERE cert_number = ${number} LIMIT 1`;
    if (rows.length === 0) return number;
  }
  fail("CERT_NUMBER_FAILED", "无法生成唯一证书编号", 500);
}

async function getOrCreateDealer(
  tx: typeof sql | TransactionSql,
  phone: string | null,
  shopName: string,
): Promise<string> {
  if (!phone) {
    await tx`SELECT pg_advisory_xact_lock(hashtext(${`dealer:${shopName}`}))`;
    const existing = await tx`
      SELECT id FROM dealers WHERE company_name = ${shopName} AND phone IS NULL LIMIT 1
    `;
    if (existing.length > 0) return String(existing[0].id);
    const inserted = await tx`
      INSERT INTO dealers (company_name, phone) VALUES (${shopName}, NULL) RETURNING id
    `;
    return String(inserted[0].id);
  }
  const result = await tx`
    INSERT INTO dealers (company_name, phone)
    VALUES (${shopName}, ${phone})
    ON CONFLICT (phone, company_name) DO UPDATE SET company_name = EXCLUDED.company_name
    RETURNING id
  `;
  return String(result[0].id);
}

function displayStatus(row: Record<string, unknown>): string {
  const status = String(row.status);
  if (status !== "ISSUED") return status;
  const today = getTodayISO();
  const start = formatDateISO(row.start_date as string | Date);
  const end = formatDateISO(row.end_date as string | Date);
  if (start > today) return "UPCOMING";
  if (end < today) return "EXPIRED";
  return "ISSUED";
}

function maskPhone(value: unknown): string | null {
  if (typeof value !== "string" || !value) return null;
  if (/^1[3-9]\d{9}$/.test(value))
    return `${value.slice(0, 3)}****${value.slice(-2)}`;
  return "***";
}

function redactPii(value: unknown): string | null {
  if (typeof value !== "string" || !value) return null;
  return value
    .replace(
      /1[3-9]\d{9}/g,
      (phone) => `${phone.slice(0, 3)}****${phone.slice(-2)}`,
    )
    .replace(
      /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g,
      (email) => `${email.slice(0, 1)}***@***`,
    );
}

function sha256Hex(buffer: Buffer): string {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

async function readVerifiedArtifact(
  storageKey: string,
  expectedSha256: string,
): Promise<Buffer | null> {
  try {
    const buffer = await readArtifact(storageKey);
    return sha256Hex(buffer) === expectedSha256 ? buffer : null;
  } catch {
    return null;
  }
}

function buildRenderInput(
  row: Record<string, unknown>,
  variant: CertificateVariant,
) {
  const parsed = parseAuthScope(
    typeof row.auth_scope === "string" ? row.auth_scope : "",
  );
  const dealerName = row.company_name ? String(row.company_name) : "";
  return {
    certNumber: String(row.cert_number),
    companyName: parsed.companyName || dealerName,
    shopName: dealerName,
    scopeText: parsed.scopeText,
    startDate: formatDateISO(row.start_date as string | Date),
    endDate: formatDateISO(row.end_date as string | Date),
    authorizer: parsed.authorizer || COMPANY_FULL_NAME,
    sealImage: row.seal_url ? String(row.seal_url) : null,
    variant,
  };
}

function mapCertificate(
  row: Record<string, unknown>,
  actor: ResolvedInternalActor,
  includeSensitive: boolean,
): CertificateListItem {
  const parsed = parseAuthScope(
    typeof row.auth_scope === "string" ? row.auth_scope : "",
  );
  const status = displayStatus(row);
  const canSensitive =
    includeSensitive && hasCapability(actor, "ba.certificates.sensitive");
  const artifactStatus = String(row.artifact_status ?? "MISSING");
  const canIssue =
    hasCapability(actor, "ba.certificates.issue") && status === "PENDING";
  const canUpdate =
    hasCapability(actor, "ba.certificates.update") &&
    status === "PENDING" &&
    (actor.role === "SUPER_ADMIN" ||
      String(row.auditor_id ?? "") === actor.profileId);
  return {
    id: String(row.id),
    certNumber: String(row.cert_number),
    status: String(row.status),
    displayStatus: status,
    companyName: parsed.companyName || String(row.company_name ?? ""),
    shopName: String(row.company_name ?? ""),
    scopeText: parsed.scopeText,
    authorizer: parsed.authorizer || COMPANY_FULL_NAME,
    phoneMasked: canSensitive
      ? row.phone
        ? String(row.phone)
        : null
      : maskPhone(row.phone),
    startDate: formatDateISO(row.start_date as string | Date),
    endDate: formatDateISO(row.end_date as string | Date),
    auditorName: row.auditor_name ? String(row.auditor_name) : null,
    createdAt: new Date(row.created_at as string | Date).toISOString(),
    updatedAt: new Date(row.updated_at as string | Date).toISOString(),
    artifact: {
      pngReady: artifactStatus === "READY",
      pdfReady: artifactStatus === "READY",
    },
    allowedActions: {
      update: canUpdate,
      issue: canIssue,
      reject:
        hasCapability(actor, "ba.certificates.issue") && status === "PENDING",
      revoke:
        hasCapability(actor, "ba.certificates.revoke") &&
        (status === "ISSUED" || status === "UPCOMING"),
      delete:
        hasCapability(actor, "ba.certificates.delete") &&
        (status === "EXPIRED" || status === "REVOKED" || status === "REJECTED"),
      preview: status === "PENDING" || status === "REJECTED",
      downloadPng:
        status === "ISSUED" ||
        status === "UPCOMING" ||
        status === "EXPIRED" ||
        status === "REVOKED",
      downloadPdf:
        status === "ISSUED" ||
        status === "UPCOMING" ||
        status === "EXPIRED" ||
        status === "REVOKED",
    },
  };
}

export async function listCertificates(options: {
  actor: ResolvedInternalActor;
  page: number;
  pageSize: number;
  status?: string;
  query?: string;
  includeSensitive: boolean;
}): Promise<{
  items: CertificateListItem[];
  total: number;
  page: number;
  pageSize: number;
}> {
  requireCapability(options.actor, "ba.certificates.read");
  const rawPage = Number(options.page);
  const rawPageSize = Number(options.pageSize);
  const page = Number.isFinite(rawPage) ? Math.max(1, Math.floor(rawPage)) : 1;
  const pageSize = Number.isFinite(rawPageSize)
    ? Math.min(100, Math.max(1, Math.floor(rawPageSize)))
    : 20;
  const status = options.status || "ALL";
  const statusCondition =
    status === "invalid"
      ? sql` AND (c.status IN ('EXPIRED', 'REVOKED', 'REJECTED') OR (c.status = 'ISSUED' AND c.end_date < CURRENT_DATE))`
      : status === "ISSUED"
        ? sql` AND c.status = 'ISSUED' AND c.start_date <= CURRENT_DATE AND c.end_date >= CURRENT_DATE`
        : status === "UPCOMING"
          ? sql` AND c.status = 'ISSUED' AND c.start_date > CURRENT_DATE`
          : status !== "ALL"
            ? sql` AND c.status = ${status}`
            : sql``;
  const pattern = options.query?.trim()
    ? buildContainsPattern(options.query.trim())
    : null;
  const searchCondition = pattern
    ? sql` AND (c.cert_number ILIKE ${pattern} OR d.company_name ILIKE ${pattern} OR split_part(c.auth_scope, ' | ', 1) ILIKE ${pattern})`
    : sql``;
  const auditorCondition =
    options.actor.role === "AUDITOR"
      ? sql` AND (c.status <> 'PENDING' OR c.auditor_id = ${options.actor.profileId})`
      : sql``;
  const where = sql`WHERE c.deleted_at IS NULL ${statusCondition} ${auditorCondition} ${searchCondition}`;
  const offset = (page - 1) * pageSize;
  const [rows, countRows] = await Promise.all([
    sql`
      SELECT c.*, d.company_name, d.phone, p.full_name AS auditor_name
      FROM certificates c
      LEFT JOIN dealers d ON c.dealer_id = d.id
      LEFT JOIN profiles p ON c.auditor_id = p.id
      ${where}
      ORDER BY c.created_at DESC
      LIMIT ${pageSize} OFFSET ${offset}
    `,
    sql`SELECT COUNT(*)::int AS count FROM certificates c LEFT JOIN dealers d ON c.dealer_id = d.id ${where}`,
  ]);
  return {
    items: rows.map((row: Record<string, unknown>) =>
      mapCertificate(row, options.actor, options.includeSensitive),
    ),
    total: Number(countRows[0]?.count ?? 0),
    page,
    pageSize,
  };
}

async function getCertificateRow(id: string): Promise<Record<string, unknown>> {
  const rows = await sql`
    SELECT c.*, d.company_name, d.phone, p.full_name AS auditor_name
    FROM certificates c
    LEFT JOIN dealers d ON c.dealer_id = d.id
    LEFT JOIN profiles p ON c.auditor_id = p.id
    WHERE c.id = ${id} AND c.deleted_at IS NULL
    LIMIT 1
  `;
  if (rows.length === 0) fail("NOT_FOUND", "证书不存在", 404);
  return rows[0] as Record<string, unknown>;
}

export async function getCertificate(options: {
  actor: ResolvedInternalActor;
  id: string;
  includeSensitive: boolean;
}): Promise<{
  certificate: CertificateListItem;
  timeline: Array<{
    id: string;
    action: string;
    comment: string | null;
    reason: string | null;
    actorName: string | null;
    actorSource: string | null;
    createdAt: string;
  }>;
}> {
  requireCapability(options.actor, "ba.certificates.read");
  if (!isUuid(options.id)) fail("INVALID_ID", "证书 ID 无效");
  const includeSensitive =
    options.includeSensitive &&
    hasCapability(options.actor, "ba.certificates.sensitive");
  const row = await getCertificateRow(options.id);
  const timeline = await sql`
    SELECT id, action, comment, reason, actor_name, actor_source, created_at
    FROM audit_logs
    WHERE certificate_id = ${options.id} OR (target_type = 'certificate' AND target_id = ${options.id})
    ORDER BY created_at DESC
    LIMIT 50
  `;
  return {
    certificate: mapCertificate(row, options.actor, options.includeSensitive),
    timeline: timeline.map((item: Record<string, unknown>) => ({
      id: String(item.id),
      action: String(item.action),
      comment: includeSensitive
        ? item.comment
          ? String(item.comment)
          : null
        : redactPii(item.comment),
      reason: includeSensitive
        ? item.reason
          ? String(item.reason)
          : null
        : redactPii(item.reason),
      actorName: item.actor_name ? String(item.actor_name) : null,
      actorSource: item.actor_source ? String(item.actor_source) : null,
      createdAt: new Date(item.created_at as string | Date).toISOString(),
    })),
  };
}

export async function createCertificate(options: {
  actor: ResolvedInternalActor;
  draft: CertificateDraft;
  issue: boolean;
  request?: Request;
}): Promise<CertificateListItem> {
  requireCapability(
    options.actor,
    options.issue ? "ba.certificates.issue" : "ba.certificates.submit",
  );
  const draft = parseDraft(options.draft);
  const certId = crypto.randomUUID();
  const certNumber = await generateCertNumber();
  const variant: CertificateVariant = options.issue ? "ISSUED" : "PREVIEW";
  const renderInput = {
    certNumber,
    companyName: draft.companyName,
    shopName: draft.shopName,
    scopeText: draft.scopeText,
    startDate: draft.startDate,
    endDate: draft.endDate,
    authorizer: COMPANY_FULL_NAME,
    sealImage: options.issue ? draft.sealImage : null,
    variant,
  };
  let artifact: Awaited<ReturnType<typeof renderAndStoreArtifact>> | null =
    null;
  let pdfArtifact: Awaited<ReturnType<typeof renderAndStoreArtifact>> | null =
    null;
  if (options.issue) {
    try {
      artifact = await renderAndStoreArtifact(certId, renderInput, "png");
      pdfArtifact = await renderAndStoreArtifact(certId, renderInput, "pdf");
    } catch (error) {
      if (artifact) await deleteArtifact(artifact.storageKey);
      throw error;
    }
  }

  try {
    await sql.begin(async (tx) => {
      const dealerId = await getOrCreateDealer(tx, draft.phone, draft.shopName);
      await tx`
        INSERT INTO certificates (
          id, cert_number, dealer_id, auth_scope, start_date, end_date, status,
          seal_url, auditor_id, manager_id, artifact_status, rendered_at, template_version
        ) VALUES (
          ${certId}, ${certNumber}, ${dealerId},
          ${buildAuthScope(draft.companyName, draft.scopeText)},
          ${draft.startDate}, ${draft.endDate},
          ${options.issue ? "ISSUED" : "PENDING"},
          ${options.issue ? draft.sealImage : null},
          ${options.issue ? null : options.actor.profileId},
          ${options.issue ? options.actor.profileId : null},
          ${options.issue ? "READY" : "MISSING"},
          ${options.issue ? new Date() : null},
          ${options.issue ? CERTIFICATE_TEMPLATE_VERSION : null}
        )
      `;
      if (options.issue && artifact && pdfArtifact) {
        for (const item of [artifact, pdfArtifact]) {
          await tx`
            INSERT INTO certificate_artifacts (
              certificate_id, format, variant, storage_key, sha256, byte_size,
              width, height, template_version, template_sha256, seal_sha256, source, created_by
            ) VALUES (
              ${certId}, ${item.storageKey.endsWith("/pdf") ? "pdf" : "png"},
              'ISSUED', ${item.storageKey}, ${item.sha256}, ${item.byteSize},
              ${item.width}, ${item.height}, ${CERTIFICATE_TEMPLATE_VERSION},
              ${item.templateSha256}, ${item.sealSha256}, 'issue', ${options.actor.profileId}
            )
          `;
        }
      }
      await writeAudit(tx, {
        actor: actorAudit(options.actor),
        action: options.issue
          ? "ISSUE_CERTIFICATE"
          : "CREATE_CERTIFICATE_PENDING",
        targetType: "certificate",
        targetId: certId,
        certificateId: certId,
        certificateRef: certId,
        comment: options.issue
          ? `主站核发证书 ${certNumber}`
          : `主站提报待审核证书 ${certNumber}`,
        after: {
          certNumber,
          companyName: draft.companyName,
          shopName: draft.shopName,
          scopeText: draft.scopeText,
          startDate: draft.startDate,
          endDate: draft.endDate,
          status: options.issue ? "ISSUED" : "PENDING",
        },
        request: options.request,
      });
    });
  } catch (error) {
    if (artifact) await deleteArtifact(artifact.storageKey);
    if (pdfArtifact) await deleteArtifact(pdfArtifact.storageKey);
    throw error;
  }

  return mapCertificate(await getCertificateRow(certId), options.actor, true);
}

export async function updatePendingCertificate(options: {
  actor: ResolvedInternalActor;
  id: string;
  draft: CertificateDraft;
  request?: Request;
}): Promise<CertificateListItem> {
  requireCapability(options.actor, "ba.certificates.update");
  if (!isUuid(options.id)) fail("INVALID_ID", "证书 ID 无效");
  const row = await getCertificateRow(options.id);
  if (String(row.status) !== "PENDING")
    fail("INVALID_STATE", "仅待审核证书可编辑");
  if (
    options.actor.role !== "SUPER_ADMIN" &&
    String(row.auditor_id ?? "") !== options.actor.profileId
  ) {
    fail("FORBIDDEN", "只能修改自己提交的待审核证书", 403);
  }
  const draft = parseDraft({
    ...options.draft,
    phone:
      options.draft.phone?.trim() ||
      (row.phone ? String(row.phone) : undefined),
  });
  const previousDealerId = String(row.dealer_id);
  const existingSealUrl = row.seal_url ? String(row.seal_url) : null;
  const nextSealUrl =
    options.actor.role === "SUPER_ADMIN"
      ? options.draft.sealImage === undefined
        ? existingSealUrl
        : draft.sealImage
      : existingSealUrl;

  await sql.begin(async (tx) => {
    const dealerId = await getOrCreateDealer(tx, draft.phone, draft.shopName);
    await tx`
      UPDATE certificates
      SET dealer_id = ${dealerId},
          auth_scope = ${buildAuthScope(draft.companyName, draft.scopeText)},
          start_date = ${draft.startDate},
          end_date = ${draft.endDate},
          seal_url = ${nextSealUrl},
          updated_at = NOW()
      WHERE id = ${options.id} AND status = 'PENDING' AND deleted_at IS NULL
    `;
    if (dealerId !== previousDealerId) {
      await tx`
        DELETE FROM dealers d
        WHERE d.id = ${previousDealerId}
          AND NOT EXISTS (SELECT 1 FROM certificates c WHERE c.dealer_id = ${previousDealerId})
      `;
    }
    await writeAudit(tx, {
      actor: actorAudit(options.actor),
      action: "UPDATE_CERTIFICATE",
      targetType: "certificate",
      targetId: options.id,
      certificateId: options.id,
      certificateRef: options.id,
      comment: `主站更新待审核证书 ${String(row.cert_number)}`,
      before: { auth_scope: row.auth_scope, dealer_id: previousDealerId },
      after: {
        companyName: draft.companyName,
        shopName: draft.shopName,
        scopeText: draft.scopeText,
        startDate: draft.startDate,
        endDate: draft.endDate,
        dealer_id: dealerId,
      },
      request: options.request,
    });
  });
  return mapCertificate(
    await getCertificateRow(options.id),
    options.actor,
    true,
  );
}

export async function issuePendingCertificate(options: {
  actor: ResolvedInternalActor;
  id: string;
  draft?: CertificateDraft;
  request?: Request;
}): Promise<CertificateListItem> {
  requireCapability(options.actor, "ba.certificates.issue");
  if (!isUuid(options.id)) fail("INVALID_ID", "证书 ID 无效");
  const row = await getCertificateRow(options.id);
  if (String(row.status) !== "PENDING")
    fail("INVALID_STATE", "该证书不是待审核状态");

  const parsed = parseAuthScope(String(row.auth_scope ?? ""));
  const draft = options.draft
    ? parseDraft({
        ...options.draft,
        phone:
          options.draft.phone?.trim() ||
          (row.phone ? String(row.phone) : undefined),
      })
    : {
        companyName: parsed.companyName || String(row.company_name ?? ""),
        shopName: String(row.company_name ?? ""),
        phone: row.phone ? String(row.phone) : null,
        scopeText: parsed.scopeText,
        startDate: formatDateISO(row.start_date as string | Date),
        endDate: formatDateISO(row.end_date as string | Date),
        sealImage: row.seal_url ? String(row.seal_url) : null,
      };
  const variant = certificateVariantForStatus("ISSUED");
  const renderInput = {
    certNumber: String(row.cert_number),
    companyName: draft.companyName,
    shopName: draft.shopName,
    scopeText: draft.scopeText,
    startDate: draft.startDate,
    endDate: draft.endDate,
    authorizer: COMPANY_FULL_NAME,
    sealImage: draft.sealImage,
    variant,
  };
  let pngArtifact: Awaited<ReturnType<typeof renderAndStoreArtifact>> | null =
    null;
  let pdfArtifact: Awaited<ReturnType<typeof renderAndStoreArtifact>> | null =
    null;
  try {
    pngArtifact = await renderAndStoreArtifact(options.id, renderInput, "png");
    pdfArtifact = await renderAndStoreArtifact(options.id, renderInput, "pdf");
  } catch (error) {
    if (pngArtifact) await deleteArtifact(pngArtifact.storageKey);
    throw error;
  }
  const previousDealerId = String(row.dealer_id);

  try {
    await sql.begin(async (tx) => {
      const dealerId = await getOrCreateDealer(tx, draft.phone, draft.shopName);
      const updated = await tx`
        UPDATE certificates
        SET status = 'ISSUED',
            dealer_id = ${dealerId},
            auth_scope = ${buildAuthScope(draft.companyName, draft.scopeText)},
            start_date = ${draft.startDate},
            end_date = ${draft.endDate},
            seal_url = ${draft.sealImage},
            manager_id = ${options.actor.profileId},
            artifact_status = 'READY',
            rendered_at = NOW(),
            template_version = ${CERTIFICATE_TEMPLATE_VERSION},
            updated_at = NOW()
        WHERE id = ${options.id} AND status = 'PENDING' AND deleted_at IS NULL
        RETURNING id
      `;
      if (updated.length === 0) fail("INVALID_STATE", "该证书不是待审核状态");
      if (dealerId !== previousDealerId) {
        await tx`
          DELETE FROM dealers d
          WHERE d.id = ${previousDealerId}
            AND NOT EXISTS (SELECT 1 FROM certificates c WHERE c.dealer_id = ${previousDealerId})
        `;
      }
      for (const item of [pngArtifact, pdfArtifact]) {
        await tx`
          INSERT INTO certificate_artifacts (
            certificate_id, format, variant, storage_key, sha256, byte_size,
            width, height, template_version, template_sha256, seal_sha256, source, created_by
          ) VALUES (
            ${options.id}, ${item.storageKey.endsWith("/pdf") ? "pdf" : "png"},
            'ISSUED', ${item.storageKey}, ${item.sha256}, ${item.byteSize},
            ${item.width}, ${item.height}, ${CERTIFICATE_TEMPLATE_VERSION},
            ${item.templateSha256}, ${item.sealSha256}, 'issue', ${options.actor.profileId}
          )
          ON CONFLICT (certificate_id, format, variant, template_version) DO NOTHING
        `;
      }
      await writeAudit(tx, {
        actor: actorAudit(options.actor),
        action: "ISSUE_CERTIFICATE",
        targetType: "certificate",
        targetId: options.id,
        certificateId: options.id,
        certificateRef: options.id,
        comment: `主站核发证书 ${String(row.cert_number)}`,
        before: { status: row.status, auth_scope: row.auth_scope },
        after: {
          status: "ISSUED",
          companyName: draft.companyName,
          shopName: draft.shopName,
          scopeText: draft.scopeText,
          startDate: draft.startDate,
          endDate: draft.endDate,
        },
        request: options.request,
      });
    });
  } catch (error) {
    await deleteArtifact(pngArtifact.storageKey);
    await deleteArtifact(pdfArtifact.storageKey);
    throw error;
  }
  return mapCertificate(
    await getCertificateRow(options.id),
    options.actor,
    true,
  );
}

export async function rejectCertificate(options: {
  actor: ResolvedInternalActor;
  id: string;
  reason: string;
  request?: Request;
}): Promise<CertificateListItem> {
  requireCapability(options.actor, "ba.certificates.issue");
  if (!isUuid(options.id)) fail("INVALID_ID", "证书 ID 无效");
  if (!options.reason.trim()) fail("REASON_REQUIRED", "请填写拒绝原因");
  await sql.begin(async (tx) => {
    const updated = await tx`
      UPDATE certificates
      SET status = 'REJECTED', manager_id = ${options.actor.profileId}, updated_at = NOW()
      WHERE id = ${options.id} AND status = 'PENDING' AND deleted_at IS NULL
      RETURNING cert_number
    `;
    if (updated.length === 0) fail("INVALID_STATE", "该证书不是待审核状态");
    await writeAudit(tx, {
      actor: actorAudit(options.actor),
      action: "REJECT_CERTIFICATE",
      targetType: "certificate",
      targetId: options.id,
      certificateId: options.id,
      certificateRef: options.id,
      comment: `主站拒绝证书 ${String(updated[0].cert_number)}`,
      reason: options.reason,
      request: options.request,
    });
  });
  return mapCertificate(
    await getCertificateRow(options.id),
    options.actor,
    true,
  );
}

export async function revokeCertificate(options: {
  actor: ResolvedInternalActor;
  id: string;
  reason: string;
  request?: Request;
}): Promise<CertificateListItem> {
  requireCapability(options.actor, "ba.certificates.revoke");
  if (!isUuid(options.id)) fail("INVALID_ID", "证书 ID 无效");
  if (!options.reason.trim()) fail("REASON_REQUIRED", "请填写吊销原因");
  await sql.begin(async (tx) => {
    const updated = await tx`
      UPDATE certificates
      SET status = 'REVOKED', updated_at = NOW()
      WHERE id = ${options.id} AND status = 'ISSUED' AND deleted_at IS NULL
      RETURNING cert_number
    `;
    if (updated.length === 0) fail("INVALID_STATE", "只能吊销已核发证书");
    await writeAudit(tx, {
      actor: actorAudit(options.actor),
      action: "REVOKE_CERTIFICATE",
      targetType: "certificate",
      targetId: options.id,
      certificateId: options.id,
      certificateRef: options.id,
      comment: `主站吊销证书 ${String(updated[0].cert_number)}`,
      reason: options.reason,
      request: options.request,
    });
  });
  return mapCertificate(
    await getCertificateRow(options.id),
    options.actor,
    true,
  );
}

export async function deleteCertificate(options: {
  actor: ResolvedInternalActor;
  id: string;
  reason: string;
  request?: Request;
}): Promise<void> {
  requireCapability(options.actor, "ba.certificates.delete");
  if (!isUuid(options.id)) fail("INVALID_ID", "证书 ID 无效");
  await sql.begin(async (tx) => {
    const updated = await tx`
      UPDATE certificates
      SET deleted_at = NOW(), deleted_by = ${options.actor.profileId}, updated_at = NOW()
      WHERE id = ${options.id}
        AND deleted_at IS NULL
        AND (
          status IN ('EXPIRED', 'REVOKED', 'REJECTED')
          OR (status = 'ISSUED' AND end_date < CURRENT_DATE)
        )
      RETURNING cert_number
    `;
    if (updated.length === 0) fail("INVALID_STATE", "该证书当前不可删除");
    await writeAudit(tx, {
      actor: actorAudit(options.actor),
      action: "DELETE_CERTIFICATE",
      targetType: "certificate",
      targetId: options.id,
      certificateId: options.id,
      certificateRef: options.id,
      comment: `主站软删除证书 ${String(updated[0].cert_number)}`,
      reason: options.reason || "soft_delete",
      request: options.request,
    });
  });
}

export async function previewCertificate(options: {
  actor: ResolvedInternalActor;
  draft: CertificateDraft;
}): Promise<{ buffer: Buffer; contentType: string }> {
  requireCapability(options.actor, "ba.certificates.read");
  const draft = parseDraft(options.draft);
  const { renderCertificatePng } = await import("./render");
  const result = await renderCertificatePng({
    certNumber: "PREVIEW",
    companyName: draft.companyName,
    shopName: draft.shopName,
    scopeText: draft.scopeText,
    startDate: draft.startDate,
    endDate: draft.endDate,
    authorizer: COMPANY_FULL_NAME,
    sealImage: draft.sealImage,
    variant: "PREVIEW",
  });
  return { buffer: result.buffer, contentType: "image/png" };
}

export async function ensureCertificateArtifact(options: {
  actor: ResolvedInternalActor;
  id: string;
  format: CertificateFormat;
  request?: Request;
}): Promise<{ buffer: Buffer; contentType: string; storageKey: string }> {
  requireCapability(options.actor, "ba.certificates.download");
  if (!isUuid(options.id)) fail("INVALID_ID", "证书 ID 无效");

  return sql.begin(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(hashtext(${`cert-artifact:${options.id}:${options.format}`}))`;
    const rows = await tx`
      SELECT c.*, d.company_name, d.phone
      FROM certificates c
      LEFT JOIN dealers d ON c.dealer_id = d.id
      WHERE c.id = ${options.id} AND c.deleted_at IS NULL
      LIMIT 1
    `;
    if (rows.length === 0) fail("NOT_FOUND", "证书不存在", 404);
    const row = rows[0] as Record<string, unknown>;
    const status = displayStatus(row);
    if (status === "PENDING" || status === "REJECTED") {
      fail("PREVIEW_ONLY", "未签发证书只能预览，不能下载正式证书", 409);
    }
    const variant = certificateVariantForStatus(status);
    const existing = await tx`
      SELECT storage_key, sha256
      FROM certificate_artifacts
      WHERE certificate_id = ${options.id}
        AND format = ${options.format}
        AND variant = ${variant}
      ORDER BY created_at DESC
      LIMIT 1
    `;
    if (existing.length > 0) {
      const storageKey = String(existing[0].storage_key);
      const buffer = await readVerifiedArtifact(
        storageKey,
        String(existing[0].sha256),
      );
      if (buffer) {
        return {
          buffer,
          contentType: contentTypeForFormat(options.format),
          storageKey,
        };
      }
    }

    const input = buildRenderInput(row, variant);
    const artifact = await renderAndStoreArtifact(
      options.id,
      input,
      options.format,
    );
    try {
      await tx`
        INSERT INTO certificate_artifacts (
          certificate_id, format, variant, storage_key, sha256, byte_size,
          width, height, template_version, template_sha256, seal_sha256, source, created_by
        ) VALUES (
          ${options.id}, ${options.format}, ${variant}, ${artifact.storageKey},
          ${artifact.sha256}, ${artifact.byteSize}, ${artifact.width}, ${artifact.height},
          ${CERTIFICATE_TEMPLATE_VERSION}, ${artifact.templateSha256}, ${artifact.sealSha256},
          'lazy', ${options.actor.profileId}
        )
        ON CONFLICT (certificate_id, format, variant, template_version)
        DO UPDATE SET
          storage_key = EXCLUDED.storage_key,
          sha256 = EXCLUDED.sha256,
          byte_size = EXCLUDED.byte_size,
          width = EXCLUDED.width,
          height = EXCLUDED.height,
          template_sha256 = EXCLUDED.template_sha256,
          seal_sha256 = EXCLUDED.seal_sha256,
          source = EXCLUDED.source
      `;
      await tx`
        UPDATE certificates
        SET artifact_status = 'READY', rendered_at = NOW(),
            template_version = ${CERTIFICATE_TEMPLATE_VERSION}, updated_at = NOW()
        WHERE id = ${options.id}
      `;
      await writeAudit(tx, {
        actor: actorAudit(options.actor),
        action: "RENDER_CERTIFICATE_ARTIFACT",
        targetType: "certificate",
        targetId: options.id,
        certificateId: options.id,
        certificateRef: options.id,
        comment: `按需生成证书文件 ${options.format}`,
        after: { variant, format: options.format, sha256: artifact.sha256 },
        request: options.request,
      });
    } catch (error) {
      await deleteArtifact(artifact.storageKey);
      throw error;
    }
    return {
      buffer: artifact.buffer,
      contentType: contentTypeForFormat(options.format),
      storageKey: artifact.storageKey,
    };
  });
}

export async function backfillCertificateArtifact(
  id: string,
): Promise<{ status: "created" | "exists" | "skipped" }> {
  const row = await getCertificateRow(id);
  const status = displayStatus(row);
  if (status === "PENDING" || status === "REJECTED")
    return { status: "skipped" };
  const variant = certificateVariantForStatus(status);
  const existing = await sql`
    SELECT format, storage_key, sha256
    FROM certificate_artifacts
    WHERE certificate_id = ${id} AND variant = ${variant}
    ORDER BY created_at DESC
  `;
  const validFormats = new Set<CertificateFormat>();
  for (const item of existing) {
    const format = String(item.format) as CertificateFormat;
    if (validFormats.has(format)) continue;
    if (
      await readVerifiedArtifact(String(item.storage_key), String(item.sha256))
    ) {
      validFormats.add(format);
    }
  }
  const missingFormats = (["png", "pdf"] as const).filter(
    (format) => !validFormats.has(format),
  );
  if (missingFormats.length === 0) return { status: "exists" };

  const input = buildRenderInput(row, variant);
  const rendered: Array<Awaited<ReturnType<typeof renderAndStoreArtifact>>> =
    [];
  try {
    for (const format of missingFormats) {
      rendered.push(await renderAndStoreArtifact(id, input, format));
    }
    await sql.begin(async (tx) => {
      for (const item of rendered) {
        const format: CertificateFormat = item.storageKey.endsWith("/pdf")
          ? "pdf"
          : "png";
        await tx`
          INSERT INTO certificate_artifacts (
            certificate_id, format, variant, storage_key, sha256, byte_size,
            width, height, template_version, template_sha256, seal_sha256, source
          ) VALUES (
            ${id}, ${format}, ${variant},
            ${item.storageKey}, ${item.sha256}, ${item.byteSize}, ${item.width}, ${item.height},
            ${CERTIFICATE_TEMPLATE_VERSION}, ${item.templateSha256}, ${item.sealSha256}, 'backfill'
          )
          ON CONFLICT (certificate_id, format, variant, template_version)
          DO UPDATE SET
            storage_key = EXCLUDED.storage_key,
            sha256 = EXCLUDED.sha256,
            byte_size = EXCLUDED.byte_size,
            width = EXCLUDED.width,
            height = EXCLUDED.height,
            template_sha256 = EXCLUDED.template_sha256,
            seal_sha256 = EXCLUDED.seal_sha256,
            source = EXCLUDED.source
        `;
      }
      await tx`
        UPDATE certificates
        SET artifact_status = 'READY', rendered_at = NOW(),
            template_version = ${CERTIFICATE_TEMPLATE_VERSION}, updated_at = NOW()
        WHERE id = ${id}
      `;
    });
  } catch (error) {
    for (const item of rendered) await deleteArtifact(item.storageKey);
    throw error;
  }
  return { status: "created" };
}

export function getCertificateMeta() {
  return {
    channels: CERTIFICATE_CHANNELS,
    defaultScopeText: DEFAULT_SCOPE_TEXT,
    companyFullName: COMPANY_FULL_NAME,
    templateVersion: CERTIFICATE_TEMPLATE_VERSION,
    statuses: [
      "PENDING",
      "ISSUED",
      "UPCOMING",
      "EXPIRED",
      "REVOKED",
      "REJECTED",
    ],
  };
}

export { CertificateServiceError };

import { NextResponse, after } from 'next/server';
import { sql, checkActionRateLimit } from '@/lib/db';
import { requireAdmin } from '@/lib/auth';
import { COMPANY_FULL_NAME } from '@/lib/config';
import { formatDateISO, parseAuthScope } from '@/lib/utils';
import { sendPendingCertNotification } from '@/lib/mail';
import { apiError, readJsonBody } from '@/lib/api-utils';
import { actorFromUser, writeAudit } from '@/lib/audit';
import { getTodayISO, isRecord, isUuid, isValidEmail, parseDateOnly } from '@/lib/validation';
import crypto from 'crypto';
import type { TransactionSql } from 'postgres';
import { ensureCertificateArtifact } from '@/lib/certificate/service';
import type { ResolvedInternalActor } from '@/lib/internal-actor';
import {
  CERTIFICATE_PERMISSIONS,
  hasCertificatePermission,
  type CertificatePermission,
} from '@/lib/certificate/access';

// 客户端提交的证书数据（字段均需由调用方在运行时校验）
interface CertDataInput {
  shopName: string;
  companyName: string;
  phone: string;
  scopeText: string;
  duration: string;
  authorizer: string;
  sealImage: string;
}

/**
 * 证书管理 API
 * 图片由前端用户实时生成，不进行持久化存储
 */

// 客户端参数错误，返回 400
class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

// 辅助函数：生成唯一的证书编号
// 格式：BAVP-YYYY-XXXXXXXX（8位十六进制，约 43 亿组合/年，降低枚举风险）
function generateUniqueCertNumber(): string {
  const year = new Date().getFullYear();
  const randomHex = crypto.randomUUID().replace(/-/g, '').substring(0, 8).toUpperCase();
  return `BAVP-${year}-${randomHex}`;
}

// 签章图片地址白名单：仅允许本地上传文件或系统默认公章，防止写入恶意外链
function isAllowedSealUrl(url: string | undefined | null): boolean {
  if (url === undefined || url === null || url === '') return true;
  if (typeof url !== 'string' || url.length > 512 || url.includes('..')) return false;
  return url === '/default-seal.png'
    || (url.startsWith('/uploads/') && /\.(png|jpe?g|webp)$/i.test(url));
}

// 辅助函数：带重试的唯一证书编号生成
async function generateCertNumberWithRetry(tx: TransactionSql | typeof sql, maxRetries = 5): Promise<string> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const certNumber = generateUniqueCertNumber();
    const existing = await tx`SELECT id FROM certificates WHERE cert_number = ${certNumber} LIMIT 1`;
    if (!existing || existing.length === 0) {
      return certNumber;
    }
  }
  throw new Error(`无法生成唯一证书编号，已重试 ${maxRetries} 次`);
}

// 安全解析 duration 字符串 "YYYY.MM.DD - YYYY.MM.DD"
function parseDuration(duration: string | undefined): { start: string; end: string } {
  if (!duration || typeof duration !== 'string') {
    throw new ValidationError('缺少有效期');
  }
  const parts = duration.split(' - ');
  if (parts.length !== 2) {
    throw new ValidationError(`有效期格式无效："${duration}"，应为 "YYYY.MM.DD - YYYY.MM.DD"`);
  }
  const startRaw = parts[0].replace(/\./g, '-').trim();
  const endRaw = parts[1].replace(/\./g, '-').trim();
  const startDate = parseDateOnly(startRaw);
  const endDate = parseDateOnly(endRaw);
  if (!startDate || !endDate) {
    throw new ValidationError(`有效期格式无效："${duration}"，请使用真实的 YYYY.MM.DD 日期`);
  }
  if (startDate.iso > endDate.iso) {
    throw new ValidationError('有效期无效：结束日期不能早于开始日期');
  }
  if (endDate.iso < getTodayISO()) {
    throw new ValidationError('有效期无效：不能提报或核发已经过期的证书');
  }
  return { start: startDate.iso, end: endDate.iso };
}

// 清理 auth_scope 输入中的分隔符，避免解析错位
function sanitizeForAuthScope(input: string): string {
  return (input || '').replace(/\s*\|\s*/g, ' ').trim();
}

// 辅助函数：查询或创建经销商
// 注意：phone 可能为 NULL，此时 PostgreSQL 的 ON CONFLICT (phone, company_name) 不生效
//       因此 NULL phone 时需要先查后插，避免创建重复经销商记录
async function getOrCreateDealer(phone: string | undefined | null, shopName: string, tx: TransactionSql | typeof sql) {
  const safePhone = phone?.trim() || null;

  if (!safePhone) {
    await tx`SELECT pg_advisory_xact_lock(hashtext(${`dealer:${shopName}`}))`;
    // NULL phone 时 ON CONFLICT 不触发，需手动去重
    const existing = await tx`SELECT id FROM dealers WHERE company_name = ${shopName} AND phone IS NULL LIMIT 1`;
    if (existing && existing.length > 0) return existing[0].id;
    const result = await tx`INSERT INTO dealers (company_name, phone) VALUES (${shopName}, NULL) RETURNING id`;
    return result[0].id;
  }

  const result = await tx`
    INSERT INTO dealers (company_name, phone) 
    VALUES (${shopName}, ${safePhone}) 
    ON CONFLICT (phone, company_name) DO UPDATE SET company_name = EXCLUDED.company_name
    RETURNING id
  `;
  return result[0].id;
}

// 权限检查辅助函数
const ACTION_PERMISSIONS: Record<string, CertificatePermission> = {
  create_pending: CERTIFICATE_PERMISSIONS.submit,
  approve_issue: CERTIFICATE_PERMISSIONS.issue,
  reject_pending: CERTIFICATE_PERMISSIONS.issue,
  update_certificate: CERTIFICATE_PERMISSIONS.update,
  revoke_certificate: CERTIFICATE_PERMISSIONS.revoke,
  delete_certificate: CERTIFICATE_PERMISSIONS.delete,
};

async function prewarmCertificateArtifacts(
  certId: string,
  user: {
    id: string;
    username?: string;
    full_name?: string;
    role: string;
    auth_source?: string;
    external_admin_id?: string;
    permissions?: string[];
  },
  request: Request,
): Promise<void> {
  const actor: ResolvedInternalActor = {
    profileId: user.id,
    externalAdminId: user.external_admin_id || user.id,
    email: user.username || null,
    name: user.full_name || null,
    role: user.role,
    source: "ba",
    capabilities: new Set([
      "ba.certificates.download",
      ...(user.permissions ?? []),
    ]),
  };
  for (const format of ["png", "pdf"] as const) {
    try {
      await ensureCertificateArtifact({ actor, id: certId, format, request });
    } catch (error) {
      console.error(
        `[certificates] 预生成服务端文件失败 ${certId} ${format}:`,
        error,
      );
    }
  }
}

export async function POST(req: Request) {
  try {
    const { data: body, response: bodyError } = await readJsonBody<{
      action?: string;
      certId?: string;
      certData?: CertDataInput;
      reason?: string;
    }>(req);
    if (bodyError) return bodyError;

    const { action, certData, certId, reason } = body!;

    if (action !== undefined && typeof action !== 'string') {
      return NextResponse.json({ error: '操作类型无效' }, { status: 400 });
    }
    if (certId !== undefined && (!isUuid(certId))) {
      return NextResponse.json({ error: '证书 ID 格式无效' }, { status: 400 });
    }
    if (reason !== undefined && (typeof reason !== 'string' || reason.length > 1000)) {
      return NextResponse.json({ error: '原因格式无效' }, { status: 400 });
    }
    if (certData !== undefined && !isRecord(certData)) {
      return NextResponse.json({ error: '证书数据格式无效' }, { status: 400 });
    }

    // 验证管理员权限
    const { user: adminUser, response } = await requireAdmin(req);
    if (response) {
      return response;
    }

    const requiredPermission = action ? ACTION_PERMISSIONS[action] : undefined;
    if (requiredPermission && !hasCertificatePermission(adminUser!, requiredPermission)) {
      return NextResponse.json(
        { error: '无权限执行该证书操作' },
        { status: 403 },
      );
    }

    // 敏感证书操作限流（按操作者 + 动作）
    const allowed = await checkActionRateLimit(
      `cert:${action || 'unknown'}:${adminUser!.id}`,
      20,
      5 * 60 * 1000
    );
    if (!allowed) {
      return NextResponse.json({ error: '操作过于频繁，请稍后再试' }, { status: 429 });
    }

    // 操作者 ID：在不同流程中代表不同角色
    //   create_pending → 作为 auditor_id（审核员提报）
    //   approve_issue / reject_pending / update_certificate（超级管理员）→ 作为 manager_id
    //   update_certificate（审核员本人）→ 保留原 auditor_id / manager_id
    //   revoke_certificate / delete_certificate → 作为审计日志的 actor_id
    const operatorId = adminUser!.id;
    const actor = actorFromUser(adminUser);

    // 授权方由服务端固定，禁止客户端伪造；自定义印章仅超级管理员可用
    const effectiveAuthorizer = COMPANY_FULL_NAME;
    const requestedSeal = certData?.sealImage || null;
    const effectiveSealImage =
      hasCertificatePermission(adminUser!, CERTIFICATE_PERMISSIONS.issue) && requestedSeal
        ? requestedSeal
        : null;

    // 字段长度校验
    if (certData) {
      if (typeof certData.shopName !== 'string' || !certData.shopName.trim()) {
        return NextResponse.json({ error: '缺少店铺/平台名称' }, { status: 400 });
      }
      if (certData.phone !== undefined && typeof certData.phone !== 'string') {
        return NextResponse.json({ error: '手机号格式无效' }, { status: 400 });
      }
      if (typeof certData.scopeText !== 'string' || !certData.scopeText.trim()) {
        return NextResponse.json({ error: '授权范围不能为空' }, { status: 400 });
      }
      if (certData.companyName !== undefined && typeof certData.companyName !== 'string') {
        return NextResponse.json({ error: '公司名称格式无效' }, { status: 400 });
      }
      if (certData.authorizer !== undefined && typeof certData.authorizer !== 'string') {
        return NextResponse.json({ error: '授权方名称格式无效' }, { status: 400 });
      }
      if (certData.sealImage !== undefined && typeof certData.sealImage !== 'string') {
        return NextResponse.json({ error: '签章图片来源不合法' }, { status: 400 });
      }
      if (certData.shopName.length > 200) {
        return NextResponse.json({ error: '授权主体名称过长，最多 200 个字符' }, { status: 400 });
      }
      if (certData.phone && certData.phone.length > 20) {
        return NextResponse.json({ error: '手机号过长，最多 20 个字符' }, { status: 400 });
      }
      if (certData.scopeText && certData.scopeText.length > 1000) {
        return NextResponse.json({ error: '授权范围过长，最多 1000 个字符' }, { status: 400 });
      }
      if (certData.companyName && certData.companyName.length > 100) {
        return NextResponse.json({ error: '公司名称过长，最多 100 个字符' }, { status: 400 });
      }
      if (certData.authorizer && certData.authorizer.length > 200) {
        return NextResponse.json({ error: '授权方名称过长，最多 200 个字符' }, { status: 400 });
      }
      if (!isAllowedSealUrl(certData.sealImage)) {
        return NextResponse.json({ error: '签章图片来源不合法' }, { status: 400 });
      }
    }

    // --- 流程 1: 审核员提报 ---
    if (action === 'create_pending') {
      if (!certData) throw new ValidationError('缺少提报数据');
      const duration = parseDuration(certData.duration);
      let certNumber = '';
      let createdCertId = '';

      await sql.begin(async (tx) => {
        certNumber = await generateCertNumberWithRetry(tx);
        const dealerId = await getOrCreateDealer(certData.phone, certData.shopName, tx);
        const rows = await tx`
          INSERT INTO certificates (cert_number, dealer_id, auth_scope, start_date, end_date, status, final_image_url, seal_url, auditor_id, manager_id)
          VALUES (
            ${certNumber},
            ${dealerId},
            ${sanitizeForAuthScope(certData.companyName) + ' | ' + (certData.scopeText || '') + ' | ' + sanitizeForAuthScope(effectiveAuthorizer)},
            ${duration.start},
            ${duration.end},
            'PENDING',
            null,
            ${effectiveSealImage},
            ${operatorId},
            null
          )
          RETURNING id
        `;
        createdCertId = String(rows[0].id);
        await writeAudit(tx, {
          actor,
          action: 'CREATE_CERTIFICATE_PENDING',
          targetType: 'certificate',
          targetId: createdCertId,
          certificateId: createdCertId,
          certificateRef: createdCertId,
          comment: `提报待审核证书 ${certNumber}`,
          after: {
            certNumber,
            shopName: certData.shopName,
            companyName: certData.companyName,
            phone: certData.phone,
            scopeText: certData.scopeText,
            duration: certData.duration,
            authorizer: effectiveAuthorizer,
            sealImage: effectiveSealImage,
          },
          request: req,
        });
      });

      // 异步通知管理员（不阻塞响应）
      after(async () => {
        try {
          const admins = await sql`SELECT email, username, full_name FROM profiles WHERE role = 'SUPER_ADMIN' AND is_banned = false AND deleted_at IS NULL`;
          const adminEmails = ((admins as unknown) as { email: unknown; username: unknown }[])
            .map((admin) => (isValidEmail(admin.email) ? admin.email : admin.username))
            .filter(isValidEmail);
          if (adminEmails.length > 0) {
            const auditorResult = await sql`SELECT full_name FROM profiles WHERE id = ${operatorId} AND deleted_at IS NULL LIMIT 1`;
            const auditorName = ((auditorResult[0] as unknown) as { full_name?: string })?.full_name || '审核员';
            const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://ba.nihplod.cn';
            await sendPendingCertNotification({
              adminEmails,
              shopName: certData.shopName || '未知店铺',
              companyName: certData.companyName,
              phone: certData.phone,
              scopeText: certData.scopeText,
              certNumber: certNumber!,
              auditorName,
              duration: certData.duration || '',
              baseUrl,
            });
          }
        } catch {
          // 邮件通知失败不影响主流程
        }
      });

      return NextResponse.json({ success: true, status: 'PENDING', certNumber: certNumber! });
    }

    // --- 流程 2: 核发证书 ---
    if (action === 'approve_issue') {
      let certDataDb: Record<string, unknown> | undefined;
      let dealerPhone: string | undefined;
      let certNumber = '';
      let auditCertId = certId || '';

      if (certId) {
        const result = await sql`
          SELECT c.*, d.phone, d.company_name FROM certificates c
          LEFT JOIN dealers d ON c.dealer_id = d.id
          WHERE c.id = ${certId}
            AND c.deleted_at IS NULL
          LIMIT 1
        `;
        if (!result || result.length === 0) throw new ValidationError(`未找到待审核证书 (ID: ${certId})`);
        certDataDb = result[0] as Record<string, unknown>;
        dealerPhone = certData ? certData.phone : (typeof certDataDb.phone === 'string' ? certDataDb.phone : undefined);
        certNumber = String(certDataDb.cert_number);
        auditCertId = certId;

        const parsedScope = parseAuthScope(
          typeof certDataDb.auth_scope === 'string' ? certDataDb.auth_scope : ''
        );
        if (!certData && !parsedScope.scopeText.trim()) {
          throw new ValidationError('授权范围不能为空，请先修改待审核资料');
        }
        const existingStart = formatDateISO(certDataDb.start_date as string | Date);
        const existingEnd = formatDateISO(certDataDb.end_date as string | Date);
        const issueDuration = certData
          ? parseDuration(certData.duration)
          : parseDuration(`${existingStart.replace(/-/g, '.')} - ${existingEnd.replace(/-/g, '.')}`);
        const correctedAuthScope = certData
          ? `${sanitizeForAuthScope(certData.companyName)} | ${certData.scopeText} | ${sanitizeForAuthScope(effectiveAuthorizer)}`
          : `${sanitizeForAuthScope(parsedScope.companyName)} | ${parsedScope.scopeText} | ${sanitizeForAuthScope(effectiveAuthorizer)}`;
        const existingDealerId = String(certDataDb.dealer_id);
        const existingSealUrl = certDataDb.seal_url == null ? null : String(certDataDb.seal_url);
        const issueSealUrl = certData ? effectiveSealImage : existingSealUrl;

        await sql.begin(async (tx) => {
          const targetDealerId = certData
            ? String(await getOrCreateDealer(certData.phone, certData.shopName, tx))
            : existingDealerId;
          const updateResult = await tx`
            UPDATE certificates
            SET status = 'ISSUED',
                dealer_id = ${targetDealerId},
                auth_scope = ${correctedAuthScope},
                start_date = ${issueDuration.start},
                end_date = ${issueDuration.end},
                seal_url = ${issueSealUrl},
                manager_id = ${operatorId},
                updated_at = NOW()
            WHERE id = ${certId}
              AND status = 'PENDING'
              AND deleted_at IS NULL
            RETURNING id
          `;
          if (!updateResult || updateResult.length === 0) {
            throw new ValidationError('该证书不是待审核状态，无法核发');
          }
          if (targetDealerId !== existingDealerId) {
            await tx`
              DELETE FROM dealers d
              WHERE d.id = ${existingDealerId}
                AND NOT EXISTS (
                  SELECT 1 FROM certificates c WHERE c.dealer_id = ${existingDealerId}
                )
            `;
          }
          await writeAudit(tx, {
            actor,
            action: 'ISSUE_CERTIFICATE',
            targetType: 'certificate',
            targetId: certId,
            certificateId: certId,
            certificateRef: certId,
            before: {
              status: certDataDb!.status,
              dealer_id: existingDealerId,
              auth_scope: certDataDb!.auth_scope,
              start_date: existingStart,
              end_date: existingEnd,
              seal_url: existingSealUrl,
            },
            after: {
              status: 'ISSUED',
              dealer_id: targetDealerId,
              auth_scope: correctedAuthScope,
              start_date: issueDuration.start,
              end_date: issueDuration.end,
              seal_url: issueSealUrl,
              manager_id: operatorId,
            },
            comment: `核发证书 ${certNumber}，经销商：${dealerPhone || '未填写电话'}`,
            request: req,
          });
        });
      } else if (certData) {
        dealerPhone = certData.phone;
        const duration = parseDuration(certData.duration);

        await sql.begin(async (tx) => {
          certNumber = await generateCertNumberWithRetry(tx);
          const dealerId = await getOrCreateDealer(certData.phone, certData.shopName, tx);
          const rows = await tx`
            INSERT INTO certificates (cert_number, dealer_id, auth_scope, start_date, end_date, status, final_image_url, seal_url, manager_id)
            VALUES (
              ${certNumber},
              ${dealerId},
              ${sanitizeForAuthScope(certData.companyName) + ' | ' + (certData.scopeText || '') + ' | ' + sanitizeForAuthScope(effectiveAuthorizer)},
              ${duration.start},
              ${duration.end},
              'ISSUED',
              null,
              ${effectiveSealImage},
              ${operatorId}
            )
            RETURNING id
          `;
          auditCertId = String(rows[0].id);
          await writeAudit(tx, {
            actor,
            action: 'ISSUE_CERTIFICATE',
            targetType: 'certificate',
            targetId: auditCertId,
            certificateId: auditCertId,
            certificateRef: auditCertId,
            comment: `直接核发证书 ${certNumber}，经销商：${dealerPhone || '未填写电话'}`,
            after: {
              certNumber,
              shopName: certData.shopName,
              companyName: certData.companyName,
              phone: certData.phone,
              scopeText: certData.scopeText,
              duration: certData.duration,
              authorizer: effectiveAuthorizer,
              sealImage: effectiveSealImage,
              status: 'ISSUED',
            },
            request: req,
          });
        });
      } else {
        throw new ValidationError('缺少核发数据');
      }

      if (auditCertId) {
        await prewarmCertificateArtifacts(auditCertId, adminUser!, req);
      }

      return NextResponse.json({ success: true, status: 'ISSUED', phone: dealerPhone, certNumber });
    }

    // --- 流程 3: 吊销证书 ---
    if (action === 'revoke_certificate') {
      if (!certId) throw new ValidationError('缺少证书 ID');

      await sql.begin(async (tx) => {
        const result = await tx`
          SELECT id, status, cert_number
          FROM certificates
          WHERE id = ${certId}
            AND deleted_at IS NULL
          LIMIT 1
        `;
        if (!result || result.length === 0) throw new ValidationError('未找到对应证书');
        if (result[0].status === 'REVOKED') {
          throw new ValidationError('证书已是吊销状态，无需重复操作');
        }
        if (result[0].status !== 'ISSUED') {
          throw new ValidationError('只能吊销已核发的证书');
        }
        const revokeResult = await tx`
          UPDATE certificates
          SET status = 'REVOKED', updated_at = NOW()
          WHERE id = ${certId}
            AND status = 'ISSUED'
            AND deleted_at IS NULL
          RETURNING id
        `;
        if (!revokeResult || revokeResult.length === 0) {
          throw new ValidationError('该证书不是可吊销状态');
        }
        await writeAudit(tx, {
          actor,
          action: 'REVOKE_CERTIFICATE',
          targetType: 'certificate',
          targetId: certId,
          certificateId: certId,
          certificateRef: certId,
          before: { status: result[0].status },
          after: { status: 'REVOKED' },
          comment: `吊销证书 ${result[0].cert_number}`,
          reason: reason || null,
          request: req,
        });
      });

      return NextResponse.json({ success: true, status: 'REVOKED' });
    }

    // --- 流程 4: 退回/拒绝 ---
    if (action === 'reject_pending') {
      if (!certId) throw new ValidationError('缺少证书 ID');

      await sql.begin(async (tx) => {
        const certInfo = await tx`
          SELECT cert_number, status
          FROM certificates
          WHERE id = ${certId}
            AND deleted_at IS NULL
          LIMIT 1
        `;
        const updateResult = await tx`
          UPDATE certificates
          SET status = 'REJECTED', manager_id = ${operatorId}, updated_at = NOW()
          WHERE id = ${certId}
            AND status = 'PENDING'
            AND deleted_at IS NULL
          RETURNING id
        `;
        if (!updateResult || updateResult.length === 0) {
          throw new ValidationError('该证书不是待审核状态，无法拒绝');
        }
        await writeAudit(tx, {
          actor,
          action: 'REJECT_CERTIFICATE',
          targetType: 'certificate',
          targetId: certId,
          certificateId: certId,
          certificateRef: certId,
          before: { status: certInfo[0]?.status ?? 'PENDING' },
          after: { status: 'REJECTED' },
          comment: `退回证书申请 ${certInfo[0]?.cert_number || ''}`,
          reason: reason || null,
          request: req,
        });
      });

      return NextResponse.json({ success: true, status: 'REJECTED' });
    }

    // --- 流程 5: 软删除 ---
    if (action === 'delete_certificate') {
      if (!certId) throw new ValidationError('缺少证书 ID');

      let deletedCertNumber = '';

      await sql.begin(async (tx) => {
        const result = await tx`
          UPDATE certificates
          SET deleted_at = NOW(), deleted_by = ${operatorId}, updated_at = NOW()
          WHERE id = ${certId}
            AND deleted_at IS NULL
            AND (
              status IN ('EXPIRED', 'REVOKED', 'REJECTED')
              OR (status = 'ISSUED' AND end_date < CURRENT_DATE)
            )
          RETURNING cert_number, status
        `;

        if (!result || result.length === 0) {
          throw new ValidationError('删除失败：只能移除已失效、已吊销或已拒绝的证书，且记录必须存在');
        }

        deletedCertNumber = String(result[0].cert_number);
        await writeAudit(tx, {
          actor,
          action: 'DELETE_CERTIFICATE',
          targetType: 'certificate',
          targetId: certId,
          certificateId: certId,
          certificateRef: certId,
          before: { status: result[0].status, cert_number: deletedCertNumber },
          after: { deleted_at: new Date().toISOString(), deleted_by: operatorId },
          comment: `软删除证书 ${deletedCertNumber}（数据与审计保留）`,
          reason: reason || 'soft_delete',
          request: req,
        });
      });

      return NextResponse.json({ success: true, message: `证书 ${deletedCertNumber} 已移除（软删除，数据与审计保留）` });
    }

    // --- 流程 6: 更新证书 ---
    if (action === 'update_certificate') {
      if (!certId) throw new ValidationError('缺少证书 ID');
      if (!certData) throw new ValidationError('缺少更新数据');

      const statusCheck = await sql`
        SELECT c.status, c.dealer_id, c.cert_number, c.auth_scope, c.start_date, c.end_date,
               c.seal_url, c.auditor_id, c.manager_id, d.phone AS dealer_phone
        FROM certificates c
        LEFT JOIN dealers d ON c.dealer_id = d.id
        WHERE c.id = ${certId}
          AND c.deleted_at IS NULL
        LIMIT 1
      `;
      if (!statusCheck || statusCheck.length === 0) {
        throw new ValidationError('未找到对应证书记录');
      }
      if (statusCheck[0].status !== 'PENDING') {
        return NextResponse.json(
          { error: '仅待审核证书可编辑；已签发证书请吊销后重新签发' },
          { status: 400 }
        );
      }

      const isSuperAdmin = adminUser!.role === 'SUPER_ADMIN';
      const ownerId = statusCheck[0].auditor_id == null ? '' : String(statusCheck[0].auditor_id);
      if (!isSuperAdmin && ownerId !== operatorId) {
        return NextResponse.json(
          { error: '只能修改自己提交的待审核证书' },
          { status: 403 }
        );
      }

      const hasField = (field: keyof CertDataInput) => (
        Object.prototype.hasOwnProperty.call(certData, field)
      );
      const dealerId = String(statusCheck[0].dealer_id);
      const certNumber = String(statusCheck[0].cert_number);
      const duration = parseDuration(certData.duration);
      const existingSealUrl = statusCheck[0].seal_url == null ? null : String(statusCheck[0].seal_url);
      const existingManagerId = statusCheck[0].manager_id == null ? null : String(statusCheck[0].manager_id);
      const existingDealerPhone = statusCheck[0].dealer_phone == null ? null : String(statusCheck[0].dealer_phone);
      const existingScope = parseAuthScope(
        typeof statusCheck[0].auth_scope === 'string' ? statusCheck[0].auth_scope : ''
      );
      const nextCompanyName = hasField('companyName') ? certData.companyName : existingScope.companyName;
      const nextScopeText = hasField('scopeText') ? certData.scopeText : existingScope.scopeText;
      const nextPhone = hasField('phone') ? (certData.phone?.trim() || null) : existingDealerPhone;
      const nextSealUrl = isSuperAdmin
        ? (hasField('sealImage') ? (certData.sealImage || null) : existingSealUrl)
        : existingSealUrl;
      const nextManagerId = existingManagerId;
      const nextAuthScope = `${sanitizeForAuthScope(nextCompanyName)} | ${nextScopeText || ''} | ${sanitizeForAuthScope(effectiveAuthorizer)}`;

      await sql.begin(async (tx) => {
        const targetDealerId = String(await getOrCreateDealer(nextPhone, certData.shopName, tx));

        // cert_number 为不可变字段：更新证书时绝不修改，确保二维码永久有效
        const updateResult = await tx`
          UPDATE certificates
          SET dealer_id = ${targetDealerId},
              auth_scope = ${nextAuthScope},
              start_date = ${duration.start},
              end_date = ${duration.end},
              seal_url = ${nextSealUrl},
              manager_id = ${nextManagerId},
              updated_at = NOW()
          WHERE id = ${certId}
            AND status = 'PENDING'
            AND deleted_at IS NULL
          RETURNING id
        `;
        if (!updateResult || updateResult.length === 0) {
          throw new ValidationError('该证书不是待审核状态，无法更新');
        }

        if (targetDealerId !== dealerId) {
          await tx`
            DELETE FROM dealers d
            WHERE d.id = ${dealerId}
              AND NOT EXISTS (
                SELECT 1 FROM certificates c WHERE c.dealer_id = ${dealerId}
              )
          `;
        }

        await writeAudit(tx, {
          actor,
          action: 'UPDATE_CERTIFICATE',
          targetType: 'certificate',
          targetId: certId,
          certificateId: certId,
          certificateRef: certId,
          before: {
            status: statusCheck[0].status,
            dealer_id: dealerId,
            auditor_id: ownerId || null,
            manager_id: existingManagerId,
            auth_scope: statusCheck[0].auth_scope,
            start_date: statusCheck[0].start_date,
            end_date: statusCheck[0].end_date,
            seal_url: existingSealUrl,
          },
          after: {
            dealer_id: targetDealerId,
            companyName: nextCompanyName,
            shopName: certData.shopName,
            scopeText: nextScopeText,
            duration: certData.duration,
            authorizer: effectiveAuthorizer,
            sealImage: nextSealUrl,
            manager_id: nextManagerId,
          },
          comment: isSuperAdmin
            ? `更新待审核证书 ${certNumber}`
            : `审核员修改本人待审核证书 ${certNumber}`,
          reason: reason || null,
          request: req,
        });
      });

      return NextResponse.json({ success: true, status: 'UPDATED', certNumber });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (err: unknown) {
    console.error('[certificates]', err);
    if (err instanceof ValidationError) {
      return apiError(err, 400, err.message);
    }
    return apiError(err, 500);
  }
}

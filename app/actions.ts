"use server";

import DOMPurify from 'isomorphic-dompurify';
import { sql, checkActionRateLimit } from '@/lib/db';
import { headers } from 'next/headers';

export interface CertificateVerifyResult {
  id: string;
  dealerName: string;
  duration: string;
  scope: string;
  status: string;
  final_image_url?: string;
}

export interface VerifyActionResponse {
  success: boolean;
  data?: CertificateVerifyResult[];
  error?: string;
}

interface DbCertRow {
  cert_number: string;
  start_date: string | Date;
  end_date: string | Date;
  auth_scope: string;
  status: string;
  final_image_url?: string;
  company_name?: string;
  dealers?: { company_name?: string } | { company_name?: string }[] | null;
}

export async function verifyCertificateAction(query: string): Promise<VerifyActionResponse> {
  const cleanQuery = query?.trim();
  
  if (!cleanQuery) {
    return { success: false, error: "请输入需要核验的证书编号或主体名称。" };
  }

  if (cleanQuery.length > 50) {
    return { success: false, error: "输入内容过长，请检查后重试。" };
  }

  try {
    let results: DbCertRow[] | null = null;

    // 1. 尝试按证书编号精确匹配
    let dbResults = await sql`
      SELECT c.cert_number, c.start_date, c.end_date, c.auth_scope, c.status, c.final_image_url,
             d.company_name
      FROM certificates c
      LEFT JOIN dealers d ON c.dealer_id = d.id
      WHERE c.cert_number = ${cleanQuery.toUpperCase()}
    `;

    if (dbResults && dbResults.length > 0) {
      results = dbResults.map((r: any) => ({
        cert_number: r.cert_number,
        start_date: r.start_date instanceof Date ? r.start_date.toISOString().split('T')[0] : r.start_date,
        end_date: r.end_date instanceof Date ? r.end_date.toISOString().split('T')[0] : r.end_date,
        auth_scope: r.auth_scope,
        status: r.status,
        final_image_url: r.final_image_url,
        dealers: { company_name: r.company_name || '未知经销商' }
      }));
    }

    // 2. 如果没有匹配，按公司名称搜索
    if (!results) {
      dbResults = await sql`
        SELECT c.cert_number, c.start_date, c.end_date, c.auth_scope, c.status, c.final_image_url,
               d.company_name
        FROM certificates c
        LEFT JOIN dealers d ON c.dealer_id = d.id
        WHERE d.company_name = ${cleanQuery}
        ORDER BY c.end_date DESC
      `;

      if (dbResults && dbResults.length > 0) {
        results = dbResults.map((r: any) => ({
          cert_number: r.cert_number,
          start_date: r.start_date instanceof Date ? r.start_date.toISOString().split('T')[0] : r.start_date,
          end_date: r.end_date instanceof Date ? r.end_date.toISOString().split('T')[0] : r.end_date,
          auth_scope: r.auth_scope,
          status: r.status,
          final_image_url: r.final_image_url,
          dealers: { company_name: r.company_name || '未知经销商' }
        }));
      }
    }
    
    if (!results || results.length === 0) {
      return { success: false, error: "未检索到相关的官方授权记录" };
    }

    const finalData: CertificateVerifyResult[] = [];

    for (const data of results) {
      let companyName = "未知经销商";
      if (data.dealers) {
        if (Array.isArray(data.dealers)) {
           companyName = data.dealers[0]?.company_name || companyName;
        } else {
           companyName = (data.dealers as { company_name: string }).company_name || companyName;
        }
      }

      const startDate = typeof data.start_date === 'string' ? data.start_date : data.start_date.toISOString().split('T')[0];
      const endDate = typeof data.end_date === 'string' ? data.end_date : data.end_date.toISOString().split('T')[0];
      finalData.push({
        id: data.cert_number,
        dealerName: companyName,
        duration: `${startDate.replace(/-/g, '.')} - ${endDate.replace(/-/g, '.')}`,
        scope: data.auth_scope || '-',
        status: data.status?.toUpperCase() || '',
        final_image_url: data.final_image_url || undefined
      });
    }

    return {
      success: true,
      data: finalData
    };
  } catch (err) {
    console.error("Certificate verification error:", err);
    return { success: false, error: "系统查询出错，请稍后再试。" };
  }
}

/**
 * 提交维权申诉工单
 */
function sanitizeInput(input: string): string {
  // 使用 DOMPurify 白名单方式彻底消毒 HTML
  return DOMPurify.sanitize(input, {
    ALLOWED_TAGS: [],
    ALLOWED_ATTR: [],
    KEEP_CONTENT: true,
  });
}

async function getClientIP(): Promise<string> {
  try {
    const h = await headers();
    const forwarded = h.get('x-forwarded-for');
    if (forwarded) return forwarded.split(',')[0].trim();
    const realIp = h.get('x-real-ip');
    if (realIp) return realIp;
  } catch {
    // headers() 在部分边缘环境可能异常
  }
  return 'unknown';
}

function isInternalUploadUrl(url?: string): boolean {
  if (!url) return true;
  // 只允许内部上传路径，防止传入恶意外链
  return url.startsWith('/uploads/');
}

export async function submitComplaintAction(formData: {
  description: string;
  channel?: string;
  contact_info?: string;
  evidence_image_url?: string;
}): Promise<{ success: boolean; error?: string; id?: string }> {
  try {
    // 限流检查：每个 IP 5 分钟内最多提交 3 次投诉
    const clientIP = await getClientIP();
    const rateKey = `complaint:${clientIP}`;
    const allowed = await checkActionRateLimit(rateKey, 3, 5 * 60 * 1000);
    if (!allowed) {
      return { success: false, error: "提交过于频繁，请 5 分钟后再试" };
    }

    // 输入长度校验
    if (!formData.description?.trim() || formData.description.length > 2000) {
      return { success: false, error: "描述不能为空且不超过 2000 字" };
    }
    if (formData.channel && formData.channel.length > 500) {
      return { success: false, error: "渠道信息不能超过 500 字" };
    }
    if (formData.contact_info && formData.contact_info.length > 200) {
      return { success: false, error: "联系方式不能超过 200 字" };
    }

    // 证据图片 URL 安全校验
    if (!isInternalUploadUrl(formData.evidence_image_url)) {
      return { success: false, error: "证据图片来源不合法" };
    }

    // XSS 消毒
    const cleanDescription = sanitizeInput(formData.description.trim());
    const cleanChannel = formData.channel ? sanitizeInput(formData.channel.trim()) : null;
    const cleanContact = formData.contact_info ? sanitizeInput(formData.contact_info.trim()) : null;

    // 提交投诉
    try {
      const insertResult = await sql`
        INSERT INTO complaints (description, channel, contact_info, evidence_image_url, status, created_at)
        VALUES (${cleanDescription}, ${cleanChannel}, ${cleanContact}, ${formData.evidence_image_url || null}, 'PENDING', NOW())
        RETURNING id
      `;
      const insertedId = insertResult[0]?.id;
      console.log('[submitComplaintAction] 投诉已提交, id:', insertedId);
      return { success: true, id: insertedId };
    } catch (err: unknown) {
      console.error("[submitComplaintAction] 数据库插入失败:", err);
      throw err;
    }
  } catch (err: unknown) {
    console.error("[submitComplaintAction] 投诉提交失败:", err);
    return { success: false, error: err instanceof Error ? err.message : "提交失败" };
  }
}

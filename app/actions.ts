"use server";

import { USE_LOCAL_DB, sql } from '@/lib/db';
import { supabaseAdmin } from '@/lib/supabase-admin';

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
  dealers?: { company_name: string } | { company_name: string }[] | null;
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

    if (USE_LOCAL_DB && sql) {
      // 1. 尝试按证书编号精确匹配
      let dbResults = await sql`
        SELECT c.cert_number, c.start_date, c.end_date, c.auth_scope, c.status, c.final_image_url,
               d.company_name
        FROM certificates c
        LEFT JOIN dealers d ON c.dealer_id = d.id
        WHERE c.cert_number = ${cleanQuery.toUpperCase()}
      `;

      if (dbResults && dbResults.length > 0) {
        results = dbResults.map((r: DbCertRow) => ({
          cert_number: r.cert_number,
          start_date: r.start_date instanceof Date ? r.start_date.toISOString().split('T')[0] : r.start_date,
          end_date: r.end_date instanceof Date ? r.end_date.toISOString().split('T')[0] : r.end_date,
          auth_scope: r.auth_scope,
          status: r.status,
          final_image_url: r.final_image_url,
          dealers: { company_name: r.company_name }
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
          results = dbResults.map((r: DbCertRow) => ({
            cert_number: r.cert_number,
            start_date: r.start_date instanceof Date ? r.start_date.toISOString().split('T')[0] : r.start_date,
            end_date: r.end_date instanceof Date ? r.end_date.toISOString().split('T')[0] : r.end_date,
            auth_scope: r.auth_scope,
            status: r.status,
            final_image_url: r.final_image_url,
            dealers: { company_name: r.company_name }
          }));
        }
      }
    } else {
      // 使用 Supabase 查询
      // 1. 按证书编号精确匹配
      const { data: certMatch } = await supabaseAdmin
        .from('certificates')
        .select(`
          cert_number,
          start_date,
          end_date,
          auth_scope,
          status,
          final_image_url,
          dealers ( company_name )
        `)
        .eq('cert_number', cleanQuery.toUpperCase());

      if (certMatch && certMatch.length > 0) {
        results = certMatch as DbCertRow[];
      }

      // 2. 按公司名称搜索
      if (!results) {
        const { data: companyMatch } = await supabaseAdmin
          .from('certificates')
          .select(`
            cert_number,
            start_date,
            end_date,
            auth_scope,
            status,
            final_image_url,
            dealers!inner ( company_name )
          `)
          .eq('dealers.company_name', cleanQuery)
          .order('end_date', { ascending: false });
        
        if (companyMatch && companyMatch.length > 0) {
          results = companyMatch as DbCertRow[];
        }
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
  // 移除潜在的危险 HTML 标签和属性
  return input
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
    .replace(/<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi, '')
    .replace(/<embed\b[^<]*>/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/on\w+\s*=/gi, '');
}

export async function submitComplaintAction(formData: {
  description: string;
  channel: string;
  evidence_image_url?: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    // 输入长度校验
    if (!formData.description?.trim() || formData.description.length > 2000) {
      return { success: false, error: "描述不能为空且不超过 2000 字" };
    }
    if (!formData.channel?.trim() || formData.channel.length > 500) {
      return { success: false, error: "渠道信息不能为空且不超过 500 字" };
    }

    // XSS 消毒
    const cleanDescription = sanitizeInput(formData.description.trim());
    const cleanChannel = sanitizeInput(formData.channel.trim());

    // 使用本地数据库支持
    if (USE_LOCAL_DB && sql) {
      try {
        await sql`
          INSERT INTO complaints (description, channel, evidence_image_url, status, created_at)
          VALUES (${cleanDescription}, ${cleanChannel}, ${formData.evidence_image_url || null}, 'PENDING', NOW())
        `;
        console.log('[submitComplaintAction] 本地数据库: 投诉已提交');
        return { success: true };
      } catch (err: unknown) {
        console.error("[submitComplaintAction] 本地数据库插入失败:", err);
        throw err;
      }
    } else {
      const { error } = await supabaseAdmin
        .from('complaints')
        .insert({
          description: formData.description,
          channel: formData.channel,
          evidence_image_url: formData.evidence_image_url,
          status: 'PENDING',
          created_at: new Date().toISOString()
        });

      if (error) throw error;
      console.log('[submitComplaintAction] Supabase: 投诉已提交');
      return { success: true };
    }
  } catch (err: unknown) {
    console.error("[submitComplaintAction] 投诉提交失败:", err);
    return { success: false, error: err instanceof Error ? err.message : "提交失败" };
  }
}

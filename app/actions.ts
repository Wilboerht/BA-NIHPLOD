"use server";

import { createClient } from '@supabase/supabase-js';

// Create a service-role client strictly for server actions to bypass RLS
// ensuring we can retrieve revoked/expired certificates for granular error reporting.
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

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

export async function verifyCertificateAction(query: string): Promise<VerifyActionResponse> {
  const cleanQuery = query?.trim();
  
  if (!cleanQuery) {
    return { success: false, error: "请输入需要核验的证书编号或主体名称。" };
  }

  if (cleanQuery.length > 50) {
    return { success: false, error: "输入内容过长，请检查后重试。" };
  }

  try {
    let results: any[] | null = null;

    // 1. First, attempt to match the certificate number exactly
    const { data: certMatch, error: certError } = await supabaseAdmin
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
      results = certMatch;
    }

    // 2. If no exact certificate match, attempt to search by exact company name
    if (!results) {
      const { data: companyMatch, error: companyError } = await supabaseAdmin
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
        results = companyMatch;
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

      finalData.push({
        id: data.cert_number,
        dealerName: companyName,
        duration: `${data.start_date.replace(/-/g, '.')} - ${data.end_date.replace(/-/g, '.')}`,
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
export async function submitComplaintAction(formData: {
  description: string;
  channel: string;
  evidence_image_url?: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
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
    return { success: true };
  } catch (err: any) {
    console.error("Failed to submit complaint:", err);
    return { success: false, error: err.message || "提交失败" };
  }
}

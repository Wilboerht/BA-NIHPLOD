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
}

export interface VerifyActionResponse {
  success: boolean;
  data?: CertificateVerifyResult;
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
    // 1. First, attempt to match the certificate number exactly (it's the most common and precise lookup)
    const { data: certMatch, error: certError } = await supabaseAdmin
      .from('certificates')
      .select(`
        cert_number,
        start_date,
        end_date,
        auth_scope,
        status,
        dealers ( company_name )
      `)
      .eq('cert_number', cleanQuery.toUpperCase())
      .limit(1)
      .maybeSingle();

    let data = certMatch;

    // 2. If no exact certificate match, attempt to search by company name (fuzzy match)
    if (!data) {
      const { data: companyMatch, error: companyError } = await supabaseAdmin
        .from('certificates')
        .select(`
          cert_number,
          start_date,
          end_date,
          auth_scope,
          status,
          dealers!inner ( company_name )
        `)
        .ilike('dealers.company_name', `%${cleanQuery}%`)
        .order('end_date', { ascending: false })
        .limit(1)
        .maybeSingle();
      
      data = companyMatch;
    }
    
    if (!data) {
      return { success: false, error: "未检索到相关的官方授权记录" };
    }

    // --- 异常风控拦截：提供极其细颗粒度的警报 ---
    const rawStatus = data.status?.toUpperCase() || '';
    
    if (rawStatus === 'REVOKED' || rawStatus === '已撤销') {
      return { 
        success: false, 
        error: "该主体的商业授权已被品牌官方撤销终止" 
      };
    }

    const isExpired = rawStatus === 'EXPIRED' || rawStatus === '已失效' || new Date() > new Date((data.end_date || '') + 'T23:59:59');
    if (isExpired) {
      return { 
        success: false, 
        error: `曾有授权，但该证书已于 ${data.end_date} 过期失效` 
      };
    }

    // 如果状态为非正常或非过期/撤销（可能有的其他异常，兜底拦截）
    if (rawStatus !== 'ISSUED' && rawStatus !== '已生效' && rawStatus !== 'ISSUING') {
      return {
        success: false,
        error: "该授权状态异常，请核查资质"
      };
    }
    
    // 安全地提取经销商名称，替代此前的 (data.dealers[0] as any)?.company_name
    let companyName = "未知经销商";
    if (data.dealers) {
      if (Array.isArray(data.dealers)) {
         companyName = data.dealers[0]?.company_name || companyName;
      } else {
         companyName = (data.dealers as { company_name: string }).company_name || companyName;
      }
    }

    return {
      success: true,
      data: {
        id: data.cert_number,
        dealerName: companyName,
        duration: `${data.start_date.replace(/-/g, '.')} - ${data.end_date.replace(/-/g, '.')}`,
        scope: data.auth_scope || '-',
        status: data.status,
      }
    };
  } catch (err) {
    console.error("Certificate verification error:", err);
    return { success: false, error: "系统查询出错，请稍后再试。" };
  }
}

"use server";

import { supabase } from "@/lib/supabase";

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

export async function verifyCertificateAction(query: string, searchMode: 'sn' | 'company' = 'sn'): Promise<VerifyActionResponse> {
  const cleanQuery = query?.trim(); // preserve case for company names
  
  if (!cleanQuery) {
    return { success: false, error: "请输入查询内容。" };
  }

  if (cleanQuery.length > 50) {
    return { success: false, error: "输入内容过长，请精简。" };
  }

  try {
    let queryBuilder = supabase
      .from('certificates')
      .select(`
        cert_number,
        start_date,
        end_date,
        auth_scope,
        status,
        dealers!inner (
          company_name
        )
      `)
      .eq('status', 'ISSUED');

    if (searchMode === 'sn') {
      queryBuilder = queryBuilder.eq('cert_number', cleanQuery.toUpperCase());
    } else if (searchMode === 'company') {
      queryBuilder = queryBuilder.like('dealers.company_name', `%${cleanQuery}%`);
    }

    const { data: results, error } = await queryBuilder.order('end_date', { ascending: false }).limit(1);
    const data = results?.[0]; // take the most recent valid one if multiple exist
    
    if (error || !data) {
      return { success: false, error: "未查询到相关授权信息。" };
    }

    // --- 逻辑加固：判定是否过期 ---
    if (new Date() > new Date(data.end_date + 'T23:59:59')) {
      return { 
        success: false, 
        error: `查询到该授权编号，但该证书已于 ${data.end_date} 过期失效。` 
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

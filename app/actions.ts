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

export async function verifyCertificateAction(query: string): Promise<VerifyActionResponse> {
  const cleanQuery = query?.trim().toUpperCase();
  
  if (!cleanQuery) {
    return { success: false, error: "请输入证书编号。" };
  }

  // 初步校验拦截防御 (防御无效/恶意长字符串)
  if (cleanQuery.length > 50) {
    return { success: false, error: "证书编号格式不正确。" };
  }

  try {
    const { data, error } = await supabase
      .from('certificates')
      .select(`
        cert_number,
        start_date,
        end_date,
        auth_scope,
        status,
        dealers (
          company_name
        )
      `)
      .eq('cert_number', cleanQuery)
      .eq('status', 'ISSUED')
      .single();
    
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

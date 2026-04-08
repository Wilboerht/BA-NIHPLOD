import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

/**
 * POST /api/certificates/verify
 * 统一的证书验证端点，用于 /verify 页面和二维码扫描
 * 使用 service-role 权限以获取过期/撤销证书的详细信息
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { certNumber } = body;

    if (!certNumber) {
      return NextResponse.json(
        { success: false, error: "证书编号不能为空" },
        { status: 400 }
      );
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseServiceRole = process.env.SUPABASE_SERVICE_ROLE_KEY!;

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRole, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });

    // 精确查询证书
    const { data, error } = await supabaseAdmin
      .from('certificates')
      .select(`
        id,
        cert_number,
        start_date,
        end_date,
        auth_scope,
        status,
        dealers ( company_name, phone ),
        final_image_url
      `)
      .eq('cert_number', certNumber.toUpperCase())
      .single();

    if (error) {
      if (error.code === 'PGRST116') { // 未找到记录
        return NextResponse.json(
          { success: false, error: "证书不存在" },
          { status: 404 }
        );
      }
      throw error;
    }

    if (!data) {
      return NextResponse.json(
        { success: false, error: "证书不存在" },
        { status: 404 }
      );
    }

    // 业务规则校验
    const rawStatus = data.status?.toUpperCase() || '';
    
    // 检查撤销
    if (rawStatus === 'REVOKED' || rawStatus === '已撤销') {
      return NextResponse.json({
        success: false,
        error: "该主体的商业授权已被品牌官方撤销终止"
      });
    }

    // 检查过期（双重检查：status 和 end_date）
    const isExpired = rawStatus === 'EXPIRED' || 
                     rawStatus === '已失效' || 
                     new Date() > new Date((data.end_date || '') + 'T23:59:59');
    if (isExpired) {
      return NextResponse.json({
        success: false,
        error: `曾有授权，但该证书已于 ${data.end_date} 过期失效`
      });
    }

    // 检查其他异常状态
    if (rawStatus !== 'ISSUED' && rawStatus !== '已生效' && rawStatus !== 'ISSUING') {
      return NextResponse.json({
        success: false,
        error: "该授权状态异常，请核查资质"
      });
    }

    // 安全提取经销商信息
    let companyName = "未知经销商";
    let phone = "";
    if (data.dealers) {
      if (Array.isArray(data.dealers)) {
        companyName = data.dealers[0]?.company_name || companyName;
        phone = data.dealers[0]?.phone || "";
      } else {
        companyName = (data.dealers as { company_name: string }).company_name || companyName;
        phone = (data.dealers as any).phone || "";
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        id: data.id,
        cert_number: data.cert_number,
        company_name: companyName,
        phone: phone,
        status: data.status,
        start_date: data.start_date,
        end_date: data.end_date,
        auth_scope: data.auth_scope || '-',
        final_image_url: data.final_image_url || null,
        dealers: data.dealers
      }
    });
  } catch (err) {
    console.error("Certificate verification error:", err);
    return NextResponse.json(
      { success: false, error: "系统查询出错，请稍后再试" },
      { status: 500 }
    );
  }
}

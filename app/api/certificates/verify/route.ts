import { NextResponse } from 'next/server';
import { sql, checkActionRateLimit } from '@/lib/db';
import { getEndOfDay } from '@/lib/utils';

function getClientIP(req: Request): string {
  const realIp = req.headers.get('x-real-ip');
  if (realIp) return realIp.trim();
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) {
    const ips = forwarded.split(',').map(s => s.trim()).filter(Boolean);
    return ips[0] || 'unknown';
  }
  return 'unknown';
}

function maskPhone(phone: string): string {
  const cleaned = String(phone || '').replace(/\D/g, '');
  if (cleaned.length < 8) return cleaned;
  return cleaned.slice(0, 3) + '****' + cleaned.slice(-4);
}

/**
 * POST /api/certificates/verify
 * 统一的证书验证端点，用于 /verify 页面和二维码扫描
 */
export async function POST(req: Request) {
  try {
    const clientIP = getClientIP(req);
    const allowed = await checkActionRateLimit(`verify:${clientIP}`, 30, 60 * 1000);
    if (!allowed) {
      return NextResponse.json(
        { success: false, error: "查询过于频繁，请稍后再试" },
        { status: 429 }
      );
    }

    const body = await req.json();
    const { certNumber } = body;

    if (!certNumber) {
      return NextResponse.json(
        { success: false, error: "证书编号不能为空" },
        { status: 400 }
      );
    }

    let data: Record<string, unknown> | null = null;

    try {
      const result = await sql`
        SELECT c.id, c.cert_number, c.start_date, c.end_date, c.auth_scope, c.status, c.final_image_url,
               d.company_name, d.phone
        FROM certificates c
        LEFT JOIN dealers d ON c.dealer_id = d.id
        WHERE c.cert_number = ${certNumber.toUpperCase()}
        LIMIT 1
      `;
      
      if (result && result.length > 0) {
        const row = result[0];
        data = {
          ...row,
          dealers: row.company_name ? { company_name: row.company_name, phone: row.phone } : null
        };
      } else {
        return NextResponse.json(
          { success: false, error: "证书不存在" },
          { status: 404 }
        );
      }
    } catch (err: unknown) {
      console.error('[certificates/verify] DB 查询失败:', err);
      return NextResponse.json(
        { success: false, error: "系统查询出错，请稍后再试" },
        { status: 500 }
      );
    }

    // 辅助函数：安全提取字符串
    const getStr = (val: unknown): string => (val == null ? '' : String(val));

    // 业务规则校验
    const rawStatus = getStr(data.status).toUpperCase();
    const endDateStr = getStr(data.end_date);

    // 负面状态统一按"未查到"处理，不暴露具体原因
    const endDate = getEndOfDay(endDateStr || '1970-01-01');
    const isExpired = rawStatus === 'EXPIRED' || new Date() > endDate;
    if (rawStatus === 'REVOKED' || isExpired || rawStatus !== 'ISSUED') {
      return NextResponse.json({
        success: false,
        error: "未检索到相关的官方授权记录"
      });
    }

    // 安全提取经销商信息
    const dealers = data.dealers as Record<string, unknown> | null;
    const companyName = getStr(dealers?.company_name) || "未知经销商";
    const rawPhone = getStr(dealers?.phone);

    return NextResponse.json({
      success: true,
      data: {
        id: data.id,
        cert_number: data.cert_number,
        company_name: companyName,
        phone: maskPhone(rawPhone),
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
    const statusCode = (err as Error & { statusCode?: number }).statusCode;
    if (statusCode === 503) {
      return NextResponse.json(
        { success: false, error: "服务暂时不可用，请稍后重试" },
        { status: 503 }
      );
    }
    return NextResponse.json(
      { success: false, error: "系统查询出错，请稍后再试" },
      { status: 500 }
    );
  }
}

import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { getEndOfDay } from '@/lib/utils';

// 内存 rate limit（PM2 单实例下有效）
const verifyAttempts = new Map<string, { count: number; resetAt: number }>();
const VERIFY_LIMIT = 30;
const VERIFY_WINDOW_MS = 60 * 1000; // 1 分钟

function checkVerifyRateLimit(ip: string): boolean {
  const now = Date.now();
  const record = verifyAttempts.get(ip);
  if (!record || now > record.resetAt) {
    verifyAttempts.set(ip, { count: 1, resetAt: now + VERIFY_WINDOW_MS });
    return true;
  }
  record.count++;
  return record.count <= VERIFY_LIMIT;
}

function getClientIP(req: Request): string {
  const realIp = req.headers.get('x-real-ip');
  if (realIp) return realIp.trim();
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) {
    const ips = forwarded.split(',').map(s => s.trim()).filter(Boolean);
    return ips[ips.length - 1] || 'unknown';
  }
  return 'unknown';
}

function maskPhone(phone: string): string {
  if (!phone || phone.length < 8) return phone;
  return phone.slice(0, 3) + '****' + phone.slice(-4);
}

/**
 * POST /api/certificates/verify
 * 统一的证书验证端点，用于 /verify 页面和二维码扫描
 */
export async function POST(req: Request) {
  try {
    const clientIP = getClientIP(req);
    if (!checkVerifyRateLimit(clientIP)) {
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
    
    // 检查撤销
    if (rawStatus === 'REVOKED') {
      return NextResponse.json({
        success: false,
        error: "该主体的商业授权已被品牌官方撤销终止"
      });
    }

    // 检查过期（双重检查：status 和 end_date）
    const endDate = getEndOfDay(endDateStr || '1970-01-01');
    const isExpired = rawStatus === 'EXPIRED' || new Date() > endDate;
    if (isExpired) {
      return NextResponse.json({
        success: false,
        error: `曾有授权，但该证书已于 ${endDateStr} 过期失效`
      });
    }

    // 检查其他异常状态
    if (rawStatus !== 'ISSUED') {
      return NextResponse.json({
        success: false,
        error: "该授权状态异常，请核查资质"
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
    return NextResponse.json(
      { success: false, error: "系统查询出错，请稍后再试" },
      { status: 500 }
    );
  }
}

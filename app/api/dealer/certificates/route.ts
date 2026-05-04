import { NextResponse } from "next/server";
import { sql, getProfileById, getDealersByProfileId } from "@/lib/db";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("userId");

    if (!userId) {
      return NextResponse.json({ error: "缺少用户标识" }, { status: 400 });
    }

    // 获取用户 profile 信息
    const { data: profile, error: profileError } = await getProfileById(userId);

    if (profileError || !profile) {
      console.error("[Dealer Certificates API] Profile fetch failed:", profileError);
      return NextResponse.json(
        { error: "用户不存在" },
        { status: 404 }
      );
    }

    // 获取用户关联的 dealers
    const { data: dealers, error: dealersError } = await getDealersByProfileId(userId);

    if (dealersError || !dealers || dealers.length === 0) {
      console.log("[Dealer Certificates API] No dealers found for userId:", userId);
      return NextResponse.json({ certificates: [], dealers: [] });
    }

    // 获取所有这些 dealers 的证书
    try {
      const dealerIds = dealers.map((d: { id: string }) => d.id);
      const certsResult = await sql`
        SELECT * FROM certificates
        WHERE dealer_id = ANY(${dealerIds}::uuid[])
          AND status = 'ISSUED'
        ORDER BY created_at DESC
      `;

      // 日期格式化：postgres 库返回 JS Date 对象，前端期望字符串
      const certs = certsResult.map((row: Record<string, unknown>) => ({
        ...row,
        start_date: row.start_date instanceof Date
          ? row.start_date.toISOString().split('T')[0]
          : row.start_date,
        end_date: row.end_date instanceof Date
          ? row.end_date.toISOString().split('T')[0]
          : row.end_date,
        created_at: row.created_at instanceof Date
          ? row.created_at.toISOString()
          : row.created_at,
      }));

      console.log("[Dealer Certificates API] 获取证书", {
        dealerCount: dealers.length,
        certCount: certs.length
      });

      return NextResponse.json({
        certificates: certs || [],
        dealers: dealers
      });
    } catch (err: unknown) {
      console.error("[Dealer Certificates API] 数据库查询失败:", err);
      return NextResponse.json(
        { error: "获取证书失败" },
        { status: 500 }
      );
    }
  } catch (err: unknown) {
    console.error("[Dealer Certificates API] API 错误:", err);
    return NextResponse.json(
      { error: "获取证书失败" },
      { status: 500 }
    );
  }
}

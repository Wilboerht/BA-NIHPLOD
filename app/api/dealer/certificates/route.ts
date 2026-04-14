import { NextResponse } from "next/server";
import { USE_LOCAL_DB, sql, getProfileById, getDealersByProfileId } from "@/lib/db";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("userId");

    if (!userId) {
      return NextResponse.json({ error: "userId is required" }, { status: 400 });
    }

    // 获取用户 profile 信息
    const { data: profile, error: profileError } = await getProfileById(userId);

    if (profileError || !profile) {
      console.error("[Dealer Certificates API] Profile fetch failed:", profileError);
      return NextResponse.json(
        { error: "User profile not found" },
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
    if (USE_LOCAL_DB && sql) {
      try {
        const dealerIds = dealers.map((d: any) => d.id);
        const certs = await sql`
          SELECT * FROM certificates
          WHERE dealer_id = ANY(${dealerIds}::uuid[])
            AND status = 'ISSUED'
          ORDER BY created_at DESC
        `;

        console.log("[Dealer Certificates API] 本地数据库: 获取证书", {
          dealerCount: dealers.length,
          certCount: certs.length
        });

        return NextResponse.json({
          certificates: certs || [],
          dealers: dealers
        });
      } catch (err: any) {
        console.error("[Dealer Certificates API] 本地数据库查询失败:", err);
        return NextResponse.json(
          { error: "Failed to fetch certificates: " + err.message },
          { status: 500 }
        );
      }
    } else {
      try {
        const dealerIds = dealers.map((d: any) => d.id);
        const { data: certs, error: certsError } = await supabaseAdmin
          .from("certificates")
          .select("*")
          .in("dealer_id", dealerIds)
          .eq("status", "ISSUED")
          .order("created_at", { ascending: false });

        if (certsError) {
          throw certsError;
        }

        console.log("[Dealer Certificates API] Supabase: 获取证书", {
          dealerCount: dealers.length,
          certCount: certs?.length
        });

        return NextResponse.json({
          certificates: certs || [],
          dealers: dealers
        });
      } catch (err: any) {
        console.error("[Dealer Certificates API] Supabase 查询失败:", err);
        return NextResponse.json(
          { error: "Failed to fetch certificates: " + err.message },
          { status: 500 }
        );
      }
    }
  } catch (err: any) {
    console.error("[Dealer Certificates API] API 错误:", err);
    return NextResponse.json(
      { error: err.message || "Internal server error" },
      { status: 500 }
    );
  }
}

import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("userId");

    if (!userId) {
      return NextResponse.json({ error: "userId is required" }, { status: 400 });
    }

    // 使用 service role key（完全绕过 RLS）从服务器端查询
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    console.log("[Dealer Certificates API] Querying for userId:", userId);

    // 首先从 profiles 表获取用户的 phone
    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("phone")
      .eq("id", userId)
      .single();

    console.log("[Dealer Certificates API] Profile result:", {
      phone: profile?.phone,
      error: profileError,
    });

    if (profileError || !profile?.phone) {
      return NextResponse.json(
        { error: "User profile not found or has no phone" },
        { status: 400 }
      );
    }

    // 1. 根据 phone 获取该用户关联的所有 dealers
    const { data: dealers, error: dealersError } = await supabaseAdmin
      .from("dealers")
      .select("id, phone, company_name")
      .eq("phone", profile.phone);

    console.log("[Dealer Certificates API] Dealers result:", {
      dealersCount: dealers?.length,
      error: dealersError,
    });

    if (dealersError) {
      return NextResponse.json(
        { error: "Failed to fetch dealers" },
        { status: 500 }
      );
    }

    if (!dealers || dealers.length === 0) {
      console.log("[Dealer Certificates API] No dealers found for userId:", userId);
      return NextResponse.json({ certificates: [] });
    }

    // 2. 获取所有这些 dealers 的证书
    const dealerIds = dealers.map((d) => d.id);
    console.log("[Dealer Certificates API] Query dealer IDs:", dealerIds);

    const { data: certs, error: certsError } = await supabaseAdmin
      .from("certificates")
      .select("id, cert_number, start_date, end_date, status, final_image_url, auth_scope, dealers(*), templates(*)")
      .in("dealer_id", dealerIds)
      .eq("status", "ISSUED")
      .order("created_at", { ascending: false });

    console.log("[Dealer Certificates API] Certificates result:", {
      certsCount: certs?.length,
      error: certsError,
    });

    if (certsError) {
      return NextResponse.json(
        { error: "Failed to fetch certificates" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      certificates: certs || [],
      dealers: dealers,
    });
  } catch (err: any) {
    console.error("[Dealer Certificates API] Error:", err);
    return NextResponse.json(
      { error: err.message || "Internal server error" },
      { status: 500 }
    );
  }
}

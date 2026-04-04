import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

function makeAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

/**
 * GET /api/admin/ban-user?userId=xxx
 * 查询指定用户的封禁状态
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("userId");
    if (!userId) return NextResponse.json({ error: "缺少 userId" }, { status: 400 });

    const supabaseAdmin = makeAdmin();
    const { data, error } = await supabaseAdmin.auth.admin.getUserById(userId);
    if (error) throw error;

    const isBanned = data.user.banned_until
      ? new Date(data.user.banned_until) > new Date()
      : false;

    return NextResponse.json({ isBanned, banned_until: data.user.banned_until });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/**
 * POST /api/admin/ban-user
 * Body: { userId: string, action: "ban" | "unban" }
 * 封禁或解封指定用户
 */
export async function POST(req: Request) {
  try {
    const { userId, action } = await req.json();

    if (!userId || !["ban", "unban"].includes(action)) {
      return NextResponse.json({ error: "参数无效" }, { status: 400 });
    }

    const supabaseAdmin = makeAdmin();

    // ban: 设置为 100 年后过期（永久封禁）; unban: 清空 banned_until
    const banned_until = action === "ban"
      ? new Date(Date.now() + 100 * 365 * 24 * 60 * 60 * 1000).toISOString()
      : "none"; // Supabase 用 "none" 字符串来清除封禁

    const { data, error } = await supabaseAdmin.auth.admin.updateUserById(userId, {
      ban_duration: action === "ban" ? "876000h" : "none",
    });

    if (error) throw error;

    return NextResponse.json({ success: true, isBanned: action === "ban" });
  } catch (err: any) {
    console.error("[ban-user]", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

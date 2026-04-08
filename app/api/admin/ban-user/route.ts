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
 * 权限检查：确保仅管理员可以封禁用户
 */
async function checkIsAdmin(adminId: string): Promise<boolean> {
  try {
    const supabaseAdmin = makeAdmin();
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('role')
      .eq('id', adminId)
      .single();

    return !!(profile && ['SUPER_ADMIN', 'AUDITOR', 'MANAGER', 'PROJECT_MANAGER'].includes(profile.role));
  } catch (error) {
    return false;
  }
}

/**
 * GET /api/admin/ban-user?userId=xxx&adminId=xxx
 * 查询指定用户的封禁状态（仅管理员可调用）
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("userId");
    const adminId = searchParams.get("adminId");

    if (!userId || !adminId) return NextResponse.json({ error: "缺少必要参数" }, { status: 400 });

    // 权限检查
    if (!(await checkIsAdmin(adminId))) {
      return NextResponse.json(
        { error: "无权限查询用户封禁状态" },
        { status: 403 }
      );
    }

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
 * Body: { userId: string, action: "ban" | "unban", adminId: string }
 * 封禁或解封指定用户（仅管理员可调用）
 */
export async function POST(req: Request) {
  try {
    const { userId, action, adminId } = await req.json();

    if (!userId || !["ban", "unban"].includes(action) || !adminId) {
      return NextResponse.json({ error: "参数无效" }, { status: 400 });
    }

    // 权限检查
    if (!(await checkIsAdmin(adminId))) {
      return NextResponse.json(
        { error: "无权限执行此操作" },
        { status: 403 }
      );
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

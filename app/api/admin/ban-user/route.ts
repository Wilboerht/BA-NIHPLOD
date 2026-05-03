import { NextResponse } from "next/server";
import { USE_LOCAL_DB, sql } from "@/lib/db";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireAdmin } from "@/lib/auth";

/**
 * POST /api/admin/ban-user
 * Body: { profileId: string, action?: "ban" | "unban" }
 * 封禁或解封指定用户（仅管理员可调用）
 */
export async function POST(req: Request) {
  try {
    const { profileId, action = "ban" } = await req.json();

    if (!profileId || !["ban", "unban"].includes(action)) {
      return NextResponse.json(
        { error: "参数无效: 需要 profileId, action" },
        { status: 400 }
      );
    }

    // 权限检查：确保是管理员
    const { response } = await requireAdmin(req);
    if (response) {
      return response;
    }

    // 执行封禁/解封操作
    if (USE_LOCAL_DB && sql) {
      try {
        const isBanned = action === "ban";
        await sql`UPDATE profiles SET is_banned = ${isBanned} WHERE id = ${profileId}`;
        console.log(`[ban-user] 本地数据库: ${action === "ban" ? "已封禁" : "已解封"} ${profileId}`);
        return NextResponse.json({
          success: true,
          action,
          profileId
        });
      } catch (err: any) {
        console.error("[ban-user] 本地数据库操作失败:", err);
        return NextResponse.json(
          { error: `操作失败: ${err.message}` },
          { status: 500 }
        );
      }
    } else {
      try {
        const banned_until = action === "ban"
          ? new Date(Date.now() + 100 * 365 * 24 * 60 * 60 * 1000).toISOString()
          : null;

        const { error } = await supabaseAdmin
          .from('profiles')
          .update({ is_banned: action === "ban" })
          .eq('id', profileId);

        if (error) throw error;

        console.log(`[ban-user] Supabase: ${action === "ban" ? "已封禁" : "已解封"} ${profileId}`);
        return NextResponse.json({
          success: true,
          action,
          profileId
        });
      } catch (err: any) {
        console.error("[ban-user] Supabase 操作失败:", err);
        return NextResponse.json(
          { error: `操作失败: ${err.message}` },
          { status: 500 }
        );
      }
    }
  } catch (err: any) {
    console.error("[ban-user] API 错误:", err);
    return NextResponse.json(
      { error: "系统错误: " + err.message },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import { USE_LOCAL_DB, sql } from "@/lib/db";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function POST(req: NextRequest) {
  try {
    const { userId } = await req.json();

    if (!userId) {
      return NextResponse.json(
        { error: "缺少必要参数: userId" },
        { status: 400 }
      );
    }

    // 更新用户的 is_first_login 标记为 false
    if (USE_LOCAL_DB && sql) {
      try {
        await sql`UPDATE profiles SET is_first_login = false WHERE id = ${userId}`;
        return NextResponse.json({
          success: true,
          message: "首次登录状态已更新"
        });
      } catch (err: any) {
        console.error("[完成首次登录] 本地数据库更新失败:", err);
        return NextResponse.json(
          { error: `更新失败: ${err.message}` },
          { status: 500 }
        );
      }
    } else {
      const { error } = await supabaseAdmin
        .from("profiles")
        .update({ is_first_login: false })
        .eq("id", userId);

      if (error) {
        console.error("[完成首次登录] Supabase 更新失败:", error);
        return NextResponse.json(
          { error: `更新失败: ${error.message}` },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        message: "首次登录状态已更新"
      });
    }
  } catch (err: any) {
    console.error("[完成首次登录] API 错误:", err);
    return NextResponse.json(
      { error: "系统错误: " + err.message },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

export async function POST(req: NextRequest) {
  try {
    // 从 Cookie JWT 获取当前用户
    const { user, response } = await requireAuth(req);
    if (response) {
      return response;
    }

    // 更新用户的 is_first_login 标记为 false
    try {
      await sql`UPDATE profiles SET is_first_login = false WHERE id = ${user!.id}`;
      return NextResponse.json({
        success: true,
        message: "首次登录状态已更新"
      });
    } catch (err: unknown) {
      console.error("[完成首次登录] 数据库更新失败:", err);
      return NextResponse.json(
        { error: '更新失败' },
        { status: 500 }
      );
    }
  } catch (err: unknown) {
    console.error("[完成首次登录] API 错误:", err);
    return NextResponse.json(
      { error: '系统错误' },
      { status: 500 }
    );
  }
}

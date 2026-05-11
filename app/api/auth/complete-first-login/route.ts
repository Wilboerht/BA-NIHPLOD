import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { sql } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { oldPassword } = body;

    if (!oldPassword) {
      return NextResponse.json(
        { error: '请提供旧密码' },
        { status: 400 }
      );
    }

    // 从 Cookie JWT 获取当前用户
    const { user, response } = await requireAuth(req);
    if (response) {
      return response;
    }

    // 验证旧密码
    try {
      const result = await sql`SELECT password_hash FROM profiles WHERE id = ${user!.id} LIMIT 1`;
      if (!result || result.length === 0) {
        return NextResponse.json({ error: '用户不存在' }, { status: 404 });
      }

      const isValid = await bcrypt.compare(oldPassword, result[0].password_hash || '');
      if (!isValid) {
        return NextResponse.json({ error: '旧密码错误' }, { status: 401 });
      }

      // 更新用户的 is_first_login 标记为 false
      await sql`UPDATE profiles SET is_first_login = false WHERE id = ${user!.id}`;
      return NextResponse.json({
        success: true,
        message: "首次登录状态已更新"
      });
    } catch (err: unknown) {
      console.error("[完成首次登录] 数据库操作失败:", err);
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

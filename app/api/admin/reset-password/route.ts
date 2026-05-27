import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { sql, checkActionRateLimit } from "@/lib/db";
import { requireAdmin, validatePassword } from "@/lib/auth";

export async function POST(req: Request) {
  try {
    const { userId, newPassword } = await req.json();

    if (!userId || !newPassword) {
      return NextResponse.json({ error: "缺少必要参数" }, { status: 400 });
    }

    // 密码强度校验
    const passwordCheck = validatePassword(newPassword);
    if (!passwordCheck.valid) {
      return NextResponse.json({ error: passwordCheck.error }, { status: 400 });
    }

    // 权限检查：只有管理员可以重置他人密码
    const { user: adminUser, response } = await requireAdmin(req);
    if (response) {
      return response;
    }

    // 速率限制
    const allowed = await checkActionRateLimit(`admin:reset-password:${adminUser!.id}`, 10);
    if (!allowed) {
      return NextResponse.json({ error: '操作过于频繁，请稍后再试' }, { status: 429 });
    }

    // 自保护：不能重置自己的密码（应走 /api/auth/change-password）
    if (userId === adminUser!.id) {
      return NextResponse.json(
        { error: '不能通过此接口重置自己的密码，请使用修改密码功能' },
        { status: 403 }
      );
    }

    // 生成新密码哈希
    const passwordHash = await bcrypt.hash(newPassword, 12);

    const result = await sql`
      UPDATE profiles 
      SET password_hash = ${passwordHash}, updated_at = NOW()
      WHERE id = ${userId} AND deleted_at IS NULL
      RETURNING id, username, full_name
    `;
    if (!result || result.length === 0) {
      return NextResponse.json({ error: "用户不存在" }, { status: 404 });
    }
    const profile = result[0];
    return NextResponse.json({ 
      success: true, 
      message: "密码已重置",
      user: {
        id: profile.id,
        username: profile.username,
        full_name: profile.full_name
      }
    });
  } catch (err: unknown) {
    console.error("[reset-password]", err);
    const errorMessage = err instanceof Error ? err.message : String(err);
    const isDev = process.env.NODE_ENV !== 'production';
    return NextResponse.json(
      { error: '操作失败', detail: isDev ? errorMessage : undefined },
      { status: 500 }
    );
  }
}

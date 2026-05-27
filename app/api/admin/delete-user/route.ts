import { NextResponse } from "next/server";
import { sql, checkActionRateLimit } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";

/**
 * POST /api/admin/delete-user
 * 软删除用户：保留关联记录中的名字，标记删除时间
 * Body: { userId: string }
 */
export async function POST(req: Request) {
  try {
    const { userId } = await req.json();

    if (!userId) {
      return NextResponse.json(
        { error: "缺少必要参数：userId" },
        { status: 400 }
      );
    }

    // 1. 权限检查 - 确保调用者是管理员
    const { user: adminUser, response } = await requireAdmin(req);
    if (response) {
      return response;
    }

    // 速率限制
    const allowed = await checkActionRateLimit(`admin:delete-user:${adminUser!.id}`, 10);
    if (!allowed) {
      return NextResponse.json({ error: '操作过于频繁，请稍后再试' }, { status: 429 });
    }

    // 自保护：不能删除自己
    if (userId === adminUser!.id) {
      return NextResponse.json(
        { error: '不能删除自己的账号' },
        { status: 403 }
      );
    }

    // 获取要删除的用户信息
    const userResult = await sql`SELECT * FROM profiles WHERE id = ${userId} AND deleted_at IS NULL LIMIT 1`;
    if (!userResult || userResult.length === 0) {
      return NextResponse.json({ error: "用户不存在或已被移除" }, { status: 404 });
    }
    const userToDelete = userResult[0];

    // 不能删除超级管理员
    if (userToDelete.role === 'SUPER_ADMIN') {
      return NextResponse.json(
        { error: '不能删除超级管理员账号' },
        { status: 403 }
      );
    }

    // 软删除用户：保留关联记录中的名字，仅标记删除时间
    const updateResult = await sql`
      UPDATE profiles
      SET deleted_at = NOW(),
          username = ${userToDelete.username + '.deleted.' + Date.now()},
          phone = ${userToDelete.phone ? userToDelete.phone + '.deleted.' + Date.now() : null}
      WHERE id = ${userId} AND deleted_at IS NULL
      RETURNING id
    `;
    if (!updateResult || updateResult.length === 0) {
      return NextResponse.json({ error: "用户不存在或已被移除" }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      message: `用户 "${userToDelete.full_name}" 已被成功移除`,
      deletedUser: {
        id: userToDelete.id,
        username: userToDelete.username,
        full_name: userToDelete.full_name
      }
    });
  } catch (err: unknown) {
    console.error("[delete-user] Error:", err);
    return NextResponse.json(
      { error: '删除失败' },
      { status: 500 }
    );
  }
}

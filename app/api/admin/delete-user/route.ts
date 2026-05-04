import { NextResponse } from "next/server";
import { sql, getProfileById } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";

/**
 * POST /api/admin/delete-user
 * 安全地删除用户，先处理所有外键关系
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

    // 自保护：不能删除自己
    if (userId === adminUser!.id) {
      return NextResponse.json(
        { error: '不能删除自己的账号' },
        { status: 403 }
      );
    }

    // 查询目标用户角色
    const { data: targetProfile } = await getProfileById(userId);
    if (targetProfile?.role === 'SUPER_ADMIN') {
      return NextResponse.json(
        { error: '不能删除超级管理员账号' },
        { status: 403 }
      );
    }

    // 获取要删除的用户信息
    const userResult = await sql`SELECT * FROM profiles WHERE id = ${userId} LIMIT 1`;
    if (!userResult || userResult.length === 0) {
      return NextResponse.json({ error: "用户不存在" }, { status: 404 });
    }
    const userToDelete = userResult[0];

    // 处理外键关系
    await sql`UPDATE certificates SET auditor_id = NULL WHERE auditor_id = ${userId}`;
    await sql`UPDATE certificates SET manager_id = NULL WHERE manager_id = ${userId}`;
    await sql`UPDATE audit_logs SET actor_id = NULL WHERE actor_id = ${userId}`;
    await sql`UPDATE complaints SET handler_id = NULL WHERE handler_id = ${userId}`;

    // 删除用户
    await sql`DELETE FROM profiles WHERE id = ${userId}`;

    return NextResponse.json({
      success: true,
      message: `用户 "${userToDelete.full_name}" 已被成功删除`,
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

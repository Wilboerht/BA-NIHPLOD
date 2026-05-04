import { NextResponse } from "next/server";
import { sql, getProfileById } from "@/lib/db";
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
    const { user: adminUser, response } = await requireAdmin(req);
    if (response) {
      return response;
    }

    // 自保护：不能封禁自己
    if (profileId === adminUser!.id) {
      return NextResponse.json(
        { error: '不能封禁自己的账号' },
        { status: 403 }
      );
    }

    // 查询目标用户角色
    const { data: targetProfile } = await getProfileById(profileId);
    if (targetProfile?.role === 'SUPER_ADMIN') {
      return NextResponse.json(
        { error: '不能封禁超级管理员账号' },
        { status: 403 }
      );
    }

    // 执行封禁/解封操作
    try {
      const isBanned = action === "ban";
      await sql`UPDATE profiles SET is_banned = ${isBanned} WHERE id = ${profileId}`;
      console.log(`[ban-user] ${action === "ban" ? "已封禁" : "已解封"} ${profileId}`);
      return NextResponse.json({
        success: true,
        action,
        profileId
      });
    } catch (err: unknown) {
      console.error("[ban-user] 数据库操作失败:", err);
      return NextResponse.json(
        { error: '操作失败' },
        { status: 500 }
      );
    }
  } catch (err: unknown) {
    console.error("[ban-user] API 错误:", err);
    return NextResponse.json(
      { error: '操作失败' },
      { status: 500 }
    );
  }
}

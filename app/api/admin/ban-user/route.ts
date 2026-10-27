import { NextResponse } from "next/server";
import { sql, getProfileById, checkActionRateLimit } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/auth";
import { readJsonBody } from "@/lib/api-utils";
import { actorFromUser, writeAudit } from "@/lib/audit";

/**
 * POST /api/admin/ban-user
 * Body: { profileId: string, action?: "ban" | "unban" }
 * 封禁或解封指定用户（仅超级管理员可调用）
 */
export async function POST(req: Request) {
  try {
    const { data: body, response: bodyError } = await readJsonBody<{
      profileId?: string;
      action?: string;
    }>(req);
    if (bodyError) return bodyError;

    const { profileId, action = "ban" } = body!;

    if (
      typeof profileId !== 'string'
      || typeof action !== 'string'
      || !profileId
      || !["ban", "unban"].includes(action)
    ) {
      return NextResponse.json(
        { error: "参数无效: 需要 profileId, action" },
        { status: 400 }
      );
    }

    // 权限检查：仅超级管理员可封禁/解封
    const { user: adminUser, response } = await requireSuperAdmin(req);
    if (response) {
      return response;
    }

    // 速率限制
    const allowed = await checkActionRateLimit(`admin:ban-user:${adminUser!.id}`, 10);
    if (!allowed) {
      return NextResponse.json({ error: '操作过于频繁，请稍后再试' }, { status: 429 });
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
    if (!targetProfile) {
      return NextResponse.json(
        { error: '用户不存在' },
        { status: 404 }
      );
    }
    if (targetProfile.role === 'SUPER_ADMIN') {
      return NextResponse.json(
        { error: '不能封禁超级管理员账号' },
        { status: 403 }
      );
    }

    // 执行封禁/解封操作
    try {
      const isBanned = action === "ban";
      await sql.begin(async (tx) => {
        await tx`
          UPDATE profiles
          SET is_banned = ${isBanned},
              token_version = token_version + 1,
              updated_at = NOW()
          WHERE id = ${profileId} AND deleted_at IS NULL
        `;
        await writeAudit(tx, {
          actor: actorFromUser(adminUser),
          action: isBanned ? 'BAN_USER' : 'UNBAN_USER',
          targetType: 'profile',
          targetId: profileId,
          before: { is_banned: Boolean(targetProfile.is_banned) },
          after: { is_banned: isBanned },
          comment: `${isBanned ? '封禁' : '解封'}管理员 ${targetProfile.full_name || targetProfile.username || profileId}`,
          request: req,
        });
      });
      console.log(`[ban-user] ${action === "ban" ? "已封禁" : "已解封"} ${profileId}`);
      return NextResponse.json({
        success: true,
        action,
        profileId
      });
    } catch (err: unknown) {
      console.error("[ban-user] 数据库操作失败:", err);
      const errorMessage = err instanceof Error ? err.message : String(err);
      const isDev = process.env.NODE_ENV !== 'production';
      return NextResponse.json(
        { error: '操作失败', detail: isDev ? errorMessage : undefined },
        { status: 500 }
      );
    }
  } catch (err: unknown) {
    console.error("[ban-user] API 错误:", err);
    const errorMessage = err instanceof Error ? err.message : String(err);
    const isDev = process.env.NODE_ENV !== 'production';
    return NextResponse.json(
      { error: '操作失败', detail: isDev ? errorMessage : undefined },
      { status: 500 }
    );
  }
}

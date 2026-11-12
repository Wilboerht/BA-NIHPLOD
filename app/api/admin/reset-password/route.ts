import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { sql, checkActionRateLimit } from "@/lib/db";
import { requireSuperAdmin, validatePassword } from "@/lib/auth";
import { readJsonBody } from "@/lib/api-utils";
import { actorFromUser, writeAudit } from "@/lib/audit";
import { isUuid } from "@/lib/validation";

export async function POST(req: Request) {
  try {
    const { data: body, response: bodyError } = await readJsonBody<{
      userId?: string;
      newPassword?: string;
    }>(req);
    if (bodyError) return bodyError;

    const { userId, newPassword } = body!;

    if (!isUuid(userId) || typeof newPassword !== 'string' || !newPassword) {
      return NextResponse.json({ error: "缺少必要参数" }, { status: 400 });
    }

    // 密码强度校验
    const passwordCheck = validatePassword(newPassword);
    if (!passwordCheck.valid) {
      return NextResponse.json({ error: passwordCheck.error }, { status: 400 });
    }

    // 权限检查：仅超级管理员可以重置他人密码（防止审核员接管超管账号）
    const { user: adminUser, response } = await requireSuperAdmin(req);
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

    // 不允许在 BA 重置主站 SSO 影子账号密码
    const targetRows = await sql`
      SELECT auth_source, role FROM profiles
      WHERE id = ${userId} AND deleted_at IS NULL
      LIMIT 1
    `;
    if (targetRows.length === 0) {
      return NextResponse.json({ error: "用户不存在" }, { status: 404 });
    }
    if (targetRows[0].auth_source === 'sso') {
      return NextResponse.json(
        { error: '该账号由主站统一管理，请在主站重置密码', code: 'MANAGED_BY_MAIN_SITE' },
        { status: 409 }
      );
    }
    // 防止超管横向接管：不允许重置其他 SUPER_ADMIN 的密码
    if (targetRows[0].role === 'SUPER_ADMIN') {
      return NextResponse.json(
        { error: '不能重置超级管理员账号的密码' },
        { status: 403 }
      );
    }

    // 生成新密码哈希
    const passwordHash = await bcrypt.hash(newPassword, 12);

    const profile = await sql.begin(async (tx) => {
      const result = await tx`
        UPDATE profiles
        SET password_hash = ${passwordHash},
            is_first_login = true,
            updated_at = NOW(),
            token_version = token_version + 1
        WHERE id = ${userId}
          AND deleted_at IS NULL
          AND role <> 'SUPER_ADMIN'
          AND auth_source <> 'sso'
        RETURNING id, username, full_name
      `;
      if (!result || result.length === 0) {
        return null;
      }
      await writeAudit(tx, {
        actor: actorFromUser(adminUser),
        action: 'RESET_PASSWORD',
        targetType: 'profile',
        targetId: userId,
        comment: `管理员重置 ${result[0].full_name || result[0].username || userId} 的密码，并要求首次登录改密`,
        reason: 'admin_reset_password',
        request: req,
      });
      return result[0];
    });
    if (!profile) {
      return NextResponse.json({ error: "用户不存在" }, { status: 404 });
    }
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

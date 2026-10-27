import { NextResponse } from 'next/server';
import { sql, getProfileById, checkActionRateLimit } from '@/lib/db';
import { requireSuperAdmin } from '@/lib/auth';
import { readJsonBody } from '@/lib/api-utils';
import { ALL_ROLES } from '@/types';
import { actorFromUser, writeAudit } from '@/lib/audit';

export async function PUT(req: Request) {
  try {
    const { data: body, response: bodyError } = await readJsonBody<{
      userId?: string;
      newRole?: string;
    }>(req);
    if (bodyError) return bodyError;

    const { userId, newRole } = body!;

    if (typeof userId !== 'string' || typeof newRole !== 'string' || !userId || !newRole) {
      return NextResponse.json(
        { error: '缺少必要参数' },
        { status: 400 }
      );
    }

    // 验证权限：仅超级管理员可以修改角色
    const { user: adminUser, response } = await requireSuperAdmin(req);
    if (response) {
      return response;
    }

    // 速率限制
    const allowed = await checkActionRateLimit(`admin:update-role:${adminUser!.id}`, 10);
    if (!allowed) {
      return NextResponse.json({ error: '操作过于频繁，请稍后再试' }, { status: 429 });
    }

    // 自保护：不能修改自己的角色
    if (userId === adminUser!.id) {
      return NextResponse.json(
        { error: '不能修改自己的角色' },
        { status: 403 }
      );
    }

    // 查询目标用户和操作用户的角色
    const { data: targetProfile } = await getProfileById(userId);
    const { data: currentAdmin } = await getProfileById(adminUser!.id);

    // 只有 SUPER_ADMIN 能创建/修改 SUPER_ADMIN
    if (newRole === 'SUPER_ADMIN' && currentAdmin?.role !== 'SUPER_ADMIN') {
      return NextResponse.json(
        { error: '只有超级管理员才能分配超级管理员角色' },
        { status: 403 }
      );
    }

    // 只有 SUPER_ADMIN 能修改现有 SUPER_ADMIN 的角色
    if (targetProfile?.role === 'SUPER_ADMIN' && currentAdmin?.role !== 'SUPER_ADMIN') {
      return NextResponse.json(
        { error: '无权修改超级管理员的角色' },
        { status: 403 }
      );
    }

    // 更新用户角色
    try {
      if (!ALL_ROLES.includes(newRole as typeof ALL_ROLES[number])) {
        return NextResponse.json(
          { error: '无效的角色值' },
          { status: 400 }
        );
      }

      const updated = await sql.begin(async (tx) => {
        const updateResult = await tx`
          UPDATE profiles
          SET role = ${newRole},
              token_version = token_version + 1,
              updated_at = NOW()
          WHERE id = ${userId} AND deleted_at IS NULL
          RETURNING id
        `;
        if (!updateResult || updateResult.length === 0) {
          return false;
        }
        await writeAudit(tx, {
          actor: actorFromUser(adminUser),
          action: 'UPDATE_USER_ROLE',
          targetType: 'profile',
          targetId: userId,
          before: { role: targetProfile?.role ?? null },
          after: { role: newRole },
          comment: `修改管理员角色为 ${newRole}`,
          reason: 'admin_role_change',
          request: req,
        });
        return true;
      });
      if (!updated) {
        return NextResponse.json({ error: '用户不存在' }, { status: 404 });
      }
      console.log('[update-user-role] 用户角色已更新');
      return NextResponse.json({ success: true });
    } catch (err: unknown) {
      console.error('[update-user-role] 数据库错误:', err);
      const errorMessage = err instanceof Error ? err.message : String(err);
      const isDev = process.env.NODE_ENV !== 'production';
      return NextResponse.json(
        { error: '操作失败', detail: isDev ? errorMessage : undefined },
        { status: 500 }
      );
    }
  } catch (err: unknown) {
    console.error('[update-user-role] API 错误:', err);
    const errorMessage = err instanceof Error ? err.message : String(err);
    const isDev = process.env.NODE_ENV !== 'production';
    return NextResponse.json(
      { error: '操作失败', detail: isDev ? errorMessage : undefined },
      { status: 500 }
    );
  }
}

import { NextResponse } from 'next/server';
import { sql, getProfileById } from '@/lib/db';
import { requireAdmin } from '@/lib/auth';
import { ALL_ROLES } from '@/types';

export async function PUT(req: Request) {
  try {
    const { userId, newRole } = await req.json();

    if (!userId || !newRole) {
      return NextResponse.json(
        { error: '缺少必要参数' },
        { status: 400 }
      );
    }

    // 验证权限：只有管理员可以修改角色
    const { user: adminUser, response } = await requireAdmin(req);
    if (response) {
      return response;
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

      const updateResult = await sql`
        UPDATE profiles 
        SET role = ${newRole}, updated_at = NOW()
        WHERE id = ${userId}
        RETURNING id
      `;
      if (!updateResult || updateResult.length === 0) {
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

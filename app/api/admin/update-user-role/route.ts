import { NextResponse } from 'next/server';
import { USE_LOCAL_DB, sql, getProfileById } from '@/lib/db';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAdmin } from '@/lib/auth';

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
    if (USE_LOCAL_DB && sql) {
      try {
        // 验证新角色值
        const validRoles = ['SUPER_ADMIN', 'AUDITOR', 'MANAGER', 'PROJECT_MANAGER', 'DEALER'];
        if (!validRoles.includes(newRole)) {
          return NextResponse.json(
            { error: '无效的角色值' },
            { status: 400 }
          );
        }

        await sql`
          UPDATE profiles 
          SET role = ${newRole}, updated_at = NOW()
          WHERE id = ${userId}
        `;
        console.log('[update-user-role] 本地数据库: 用户角色已更新');
        return NextResponse.json({ success: true });
      } catch (err: any) {
        console.error('[update-user-role] 本地数据库错误:', err);
        return NextResponse.json(
          { error: err.message },
          { status: 500 }
        );
      }
    } else {
      try {
        const { error } = await supabaseAdmin
          .from('profiles')
          .update({ role: newRole, updated_at: new Date().toISOString() })
          .eq('id', userId);

        if (error) throw error;
        console.log('[update-user-role] Supabase: 用户角色已更新');
        return NextResponse.json({ success: true });
      } catch (err: any) {
        console.error('[update-user-role] Supabase 错误:', err);
        return NextResponse.json(
          { error: err.message },
          { status: 500 }
        );
      }
    }
  } catch (err: any) {
    console.error('[update-user-role] API 错误:', err);
    return NextResponse.json(
      { error: err.message },
      { status: 500 }
    );
  }
}

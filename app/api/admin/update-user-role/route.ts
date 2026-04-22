import { NextResponse } from 'next/server';
import { USE_LOCAL_DB, sql, checkIsAdmin } from '@/lib/db';
import { supabaseAdmin } from '@/lib/supabase-admin';

export async function PUT(req: Request) {
  try {
    const { userId, newRole, adminId } = await req.json();

    if (!userId || !newRole) {
      return NextResponse.json(
        { error: '缺少必要参数' },
        { status: 400 }
      );
    }

    // 验证权限：只有管理员可以修改角色
    if (!adminId || !(await checkIsAdmin(adminId))) {
      return NextResponse.json(
        { error: '无权限修改用户角色' },
        { status: 403 }
      );
    }

    // 更新用户角色
    if (USE_LOCAL_DB && sql) {
      try {
        // 验证新角色值
        const validRoles = ['SUPER_ADMIN', 'AUDITOR', 'MANAGER', 'PROJECT_MANAGER', 'USER', 'DEALER'];
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

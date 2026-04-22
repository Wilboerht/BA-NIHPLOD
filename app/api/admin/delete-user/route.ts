import { NextResponse } from "next/server";
import { USE_LOCAL_DB, sql, checkIsAdmin } from "@/lib/db";
import { supabaseAdmin } from "@/lib/supabase-admin";

/**
 * POST /api/admin/delete-user
 * 安全地删除用户，先处理所有外键关系
 * Body: { userId: string, adminId: string }
 */
export async function POST(req: Request) {
  try {
    const { userId, adminId } = await req.json();

    if (!userId || !adminId) {
      return NextResponse.json(
        { error: "缺少必要参数：userId 和 adminId" },
        { status: 400 }
      );
    }

    // 1. 权限检查 - 确保调用者是管理员
    if (!(await checkIsAdmin(adminId))) {
      return NextResponse.json(
        { error: "无权限执行此操作或身份验证失败" },
        { status: 403 }
      );
    }

    if (USE_LOCAL_DB && sql) {
      // 本地 PostgreSQL 模式
      // 2. 获取要删除的用户信息
      const userResult = await sql`SELECT * FROM profiles WHERE id = ${userId} LIMIT 1`;
      if (!userResult || userResult.length === 0) {
        return NextResponse.json({ error: "用户不存在" }, { status: 404 });
      }
      const userToDelete = userResult[0];

      // 3. 处理外键关系
      await sql`UPDATE certificates SET auditor_id = NULL WHERE auditor_id = ${userId}`;
      await sql`UPDATE certificates SET manager_id = NULL WHERE manager_id = ${userId}`;
      await sql`UPDATE audit_logs SET actor_id = NULL WHERE actor_id = ${userId}`;
      await sql`UPDATE complaints SET handler_id = NULL WHERE handler_id = ${userId}`;

      // 4. 删除用户
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
    } else {
      // Supabase 模式
      // 2. 获取要删除的用户信息
      const { data: userToDelete, error: userError } = await supabaseAdmin
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (userError || !userToDelete) {
        return NextResponse.json({ error: "用户不存在" }, { status: 404 });
      }

      // 3. 处理外键关系
      await supabaseAdmin.from('certificates').update({ auditor_id: null }).eq('auditor_id', userId);
      await supabaseAdmin.from('certificates').update({ manager_id: null }).eq('manager_id', userId);
      await supabaseAdmin.from('audit_logs').update({ actor_id: null }).eq('actor_id', userId);
      await supabaseAdmin.from('complaints').update({ handler_id: null }).eq('handler_id', userId);

      // 4. 删除用户
      const { error: deleteError } = await supabaseAdmin.from('profiles').delete().eq('id', userId);
      if (deleteError) {
        console.error("Failed to delete user:", deleteError);
        return NextResponse.json(
          { error: `删除用户失败: ${deleteError.message}` },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        message: `用户 "${userToDelete.full_name}" 已被成功删除`,
        deletedUser: {
          id: userToDelete.id,
          username: userToDelete.username,
          full_name: userToDelete.full_name
        }
      });
    }
  } catch (err: any) {
    console.error("[delete-user] Error:", err);
    return NextResponse.json(
      { error: `删除失败: ${err.message}` },
      { status: 500 }
    );
  }
}

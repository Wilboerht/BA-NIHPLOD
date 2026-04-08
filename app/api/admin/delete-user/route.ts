import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

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

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseServiceRole = process.env.SUPABASE_SERVICE_ROLE_KEY!;

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRole, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });

    // 1. 权限检查 - 确保调用者是管理员
    const { data: adminProfile, error: adminError } = await supabaseAdmin
      .from('profiles')
      .select('role')
      .eq('id', adminId)
      .single();

    if (adminError || !adminProfile) {
      return NextResponse.json(
        { error: "管理员身份验证失败" },
        { status: 403 }
      );
    }

    if (!['SUPER_ADMIN', 'AUDITOR', 'MANAGER'].includes(adminProfile.role)) {
      return NextResponse.json(
        { error: "无权限删除用户" },
        { status: 403 }
      );
    }

    // 2. 获取要删除的用户信息
    const { data: userToDelete, error: userError } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (userError || !userToDelete) {
      return NextResponse.json(
        { error: "用户不存在" },
        { status: 404 }
      );
    }

    // 3. 处理外键关系
    // 3a. 清空 certificates 表中该用户作为 auditor_id 的记录
    const { error: auditError } = await supabaseAdmin
      .from('certificates')
      .update({ auditor_id: null })
      .eq('auditor_id', userId);

    if (auditError) {
      console.error("Failed to clear auditor references:", auditError);
      return NextResponse.json(
        { error: `清空审核人引用失败: ${auditError.message}` },
        { status: 500 }
      );
    }

    // 3b. 清空 certificates 表中该用户作为 manager_id 的记录
    const { error: managerError } = await supabaseAdmin
      .from('certificates')
      .update({ manager_id: null })
      .eq('manager_id', userId);

    if (managerError) {
      console.error("Failed to clear manager references:", managerError);
      return NextResponse.json(
        { error: `清空发证人引用失败: ${managerError.message}` },
        { status: 500 }
      );
    }

    // 3c. 清空 audit_logs 表中该用户作为 actor_id 的记录
    const { error: logsError } = await supabaseAdmin
      .from('audit_logs')
      .update({ actor_id: null })
      .eq('actor_id', userId);

    if (logsError) {
      console.error("Failed to clear audit log references:", logsError);
      return NextResponse.json(
        { error: `清空审核日志引用失败: ${logsError.message}` },
        { status: 500 }
      );
    }

    // 3d. 清空 complaints 表中该用户作为 handler_id 的记录
    const { error: complaintError } = await supabaseAdmin
      .from('complaints')
      .update({ handler_id: null })
      .eq('handler_id', userId);

    if (complaintError) {
      console.error("Failed to clear complaint handler references:", complaintError);
      return NextResponse.json(
        { error: `清空投诉处理人引用失败: ${complaintError.message}` },
        { status: 500 }
      );
    }

    // 4. 现在安全地删除用户
    const { error: deleteError } = await supabaseAdmin
      .from('profiles')
      .delete()
      .eq('id', userId);

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

  } catch (err: any) {
    console.error("[delete-user] Error:", err);
    return NextResponse.json(
      { error: `删除失败: ${err.message}` },
      { status: 500 }
    );
  }
}

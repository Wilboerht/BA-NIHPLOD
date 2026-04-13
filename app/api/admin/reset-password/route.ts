import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { supabaseAdmin, checkIsAdmin } from "@/lib/supabase-admin";

export async function POST(req: Request) {
  try {
    const { userId, newPassword, adminId } = await req.json();

    if (!userId || !newPassword || newPassword.length < 6) {
      return NextResponse.json({ error: "密码长度必须至少为 6 位" }, { status: 400 });
    }

    // 权限检查：只有管理员可以重置他人密码
    if (!adminId || !(await checkIsAdmin(adminId))) {
      return NextResponse.json(
        { error: '无权限重置用户密码' },
        { status: 403 }
      );
    }

    // 生成新密码哈希
    const passwordHash = await bcrypt.hash(newPassword, 10);

    // 直接在 profiles 表中更新密码哈希
    const { data: profile, error: profileErr } = await supabaseAdmin
      .from("profiles")
      .update({ 
        password_hash: passwordHash,
        updated_at: new Date().toISOString()
      })
      .eq("id", userId)
      .select()
      .single();

    if (profileErr) {
      console.error("[reset-password] Profile update error:", profileErr);
      return NextResponse.json({ error: `重置失败: ${profileErr.message}` }, { status: 500 });
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
  } catch (err: any) {
    console.error("[reset-password]", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

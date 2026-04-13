import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { supabaseAdmin, checkIsAdmin } from "@/lib/supabase-admin";

export async function POST(req: Request) {
  try {
    const { fullName, username, password, role, adminId } = await req.json();

    // 权限检查：只有管理员可以创建新管理员
    if (!adminId || !(await checkIsAdmin(adminId))) {
      return NextResponse.json(
        { error: "无权限创建新的管理员账户" },
        { status: 403 }
      );
    }

    // 基本校验
    if (!fullName || !username || !password || !role) {
      return NextResponse.json({ error: "请填写所有必填字段" }, { status: 400 });
    }
    if (password.length < 6) {
      return NextResponse.json({ error: "密码长度不得少于 6 位" }, { status: 400 });
    }
    if (!["SUPER_ADMIN", "AUDITOR"].includes(role)) {
      return NextResponse.json({ error: "无效的角色类型" }, { status: 400 });
    }

    // 使用 username 作为邮箱
    const email = username.trim();

    // 验证邮箱格式
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { error: `邮箱格式无效："${email}"。请输入有效的邮箱地址（如：user@example.com）` },
        { status: 400 }
      );
    }

    // 生成密码哈希
    const passwordHash = await bcrypt.hash(password, 10);

    // 直接在 profiles 表中插入管理员账户
    const { data, error: profileErr } = await supabaseAdmin.from("profiles").insert({
      username: email.trim().toLowerCase(),
      full_name: fullName.trim(),
      password_hash: passwordHash,
      role,
      is_first_login: false,
    }).select('id');

    if (profileErr) {
      console.error("[create-admin] Insert error:", profileErr);
      
      // 检查是否是唯一性冲突
      if (profileErr.message.includes("duplicate") || profileErr.message.includes("unique")) {
        return NextResponse.json(
          { error: `邮箱 "${email}" 已被使用，请换一个。` },
          { status: 409 }
        );
      }
      
      return NextResponse.json(
        { error: `创建账户失败: ${profileErr.message}` },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true, email });
  } catch (err: any) {
    console.error("[create-admin]", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

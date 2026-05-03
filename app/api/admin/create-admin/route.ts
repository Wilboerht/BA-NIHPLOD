import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { supabaseAdmin, checkIsAdmin } from "@/lib/supabase-admin";
import { USE_LOCAL_DB, sql } from "@/lib/db";
import { requireAdmin, validatePassword } from "@/lib/auth";

export async function POST(req: Request) {
  try {
    // 权限检查：只有管理员可以创建新管理员
    const { user, response } = await requireAdmin(req);
    if (response) {
      return response;
    }

    const { fullName, username, password, role } = await req.json();

    // 基本校验
    if (!fullName || !username || !password || !role) {
      return NextResponse.json({ error: "请填写所有必填字段" }, { status: 400 });
    }

    // 密码强度校验
    const passwordCheck = validatePassword(password);
    if (!passwordCheck.valid) {
      return NextResponse.json({ error: passwordCheck.error }, { status: 400 });
    }

    // 允许的角色
    const validRoles = ['SUPER_ADMIN', 'AUDITOR', 'MANAGER', 'PROJECT_MANAGER'];
    if (!validRoles.includes(role)) {
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

    // 本地 PostgreSQL 模式
    if (USE_LOCAL_DB && sql) {
      try {
        const result = await sql`
          INSERT INTO profiles (username, full_name, password_hash, role, is_first_login)
          VALUES (${email.trim().toLowerCase()}, ${fullName.trim()}, ${passwordHash}, ${role}, false)
          RETURNING id
        `;
        return NextResponse.json({ success: true, email });
      } catch (err: any) {
        console.error("[create-admin] Local DB insert error:", err);
        if (err.message?.includes("unique") || err.message?.includes("duplicate")) {
          return NextResponse.json(
            { error: `邮箱 "${email}" 已被使用，请换一个。` },
            { status: 409 }
          );
        }
        return NextResponse.json(
          { error: `创建账户失败: ${err.message}` },
          { status: 400 }
        );
      }
    }

    // Supabase 模式
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

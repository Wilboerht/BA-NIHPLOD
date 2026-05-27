import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { sql, checkActionRateLimit } from "@/lib/db";
import { requireAdmin, validatePassword } from "@/lib/auth";
import { ADMIN_ROLES } from "@/types";

export async function POST(req: Request) {
  try {
    // 权限检查：只有管理员可以创建新管理员
    const { user: adminUser, response } = await requireAdmin(req);
    if (response) {
      return response;
    }

    // 速率限制
    const allowed = await checkActionRateLimit(`admin:create-admin:${adminUser!.id}`, 10);
    if (!allowed) {
      return NextResponse.json({ error: '操作过于频繁，请稍后再试' }, { status: 429 });
    }

    const { fullName, username, password, role } = await req.json();

    // 基本校验
    if (!fullName || !username || !password || !role) {
      return NextResponse.json({ error: "请填写所有必填字段" }, { status: 400 });
    }

    // 字段长度校验
    if (fullName.length > 100) {
      return NextResponse.json({ error: "姓名过长，最多 100 个字符" }, { status: 400 });
    }
    if (username.length > 255) {
      return NextResponse.json({ error: "邮箱过长，最多 255 个字符" }, { status: 400 });
    }

    // 密码强度校验
    const passwordCheck = validatePassword(password);
    if (!passwordCheck.valid) {
      return NextResponse.json({ error: passwordCheck.error }, { status: 400 });
    }

    if (!ADMIN_ROLES.includes(role as typeof ADMIN_ROLES[number])) {
      return NextResponse.json({ error: "无效的角色类型" }, { status: 400 });
    }

    // 只有 SUPER_ADMIN 能创建 SUPER_ADMIN
    if (role === 'SUPER_ADMIN' && adminUser?.role !== 'SUPER_ADMIN') {
      return NextResponse.json(
        { error: "只有超级管理员才能创建超级管理员账户" },
        { status: 403 }
      );
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
    const passwordHash = await bcrypt.hash(password, 12);

    try {
      await sql`
        INSERT INTO profiles (username, full_name, email, password_hash, role, is_first_login)
        VALUES (${email.trim().toLowerCase()}, ${fullName.trim()}, ${email.trim().toLowerCase()}, ${passwordHash}, ${role}, false)
        RETURNING id
      `;
      return NextResponse.json({ success: true, email });
    } catch (err: unknown) {
      console.error("[create-admin] DB insert error:", err);
      const msg = err instanceof Error ? err.message : '';
      if (msg.includes("unique") || msg.includes("duplicate")) {
        return NextResponse.json(
          { error: `邮箱 "${email}" 已被使用，请换一个。` },
          { status: 409 }
        );
      }
      return NextResponse.json(
        { error: '创建账户失败' },
        { status: 400 }
      );
    }
  } catch (err: unknown) {
    console.error("[create-admin]", err);
    const errorMessage = err instanceof Error ? err.message : String(err);
    const isDev = process.env.NODE_ENV !== 'production';
    return NextResponse.json(
      { error: '操作失败', detail: isDev ? errorMessage : undefined },
      { status: 500 }
    );
  }
}

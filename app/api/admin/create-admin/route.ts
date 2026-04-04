import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const { fullName, username, password, role } = await req.json();

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

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // 生成内部邮箱（username@admin.nihplod.cn）
    const email = `${username.trim().toLowerCase()}@admin.nihplod.cn`;

    // 1. 创建 Auth 账户
    const { data: authData, error: authErr } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (authErr) {
      // 账号已存在
      if (authErr.message.includes("already been registered")) {
        return NextResponse.json({ error: `账号名 "${username}" 已被使用，请换一个。` }, { status: 409 });
      }
      throw authErr;
    }

    const userId = authData.user.id;

    // 2. 写入 profiles 表
    const { error: profileErr } = await supabaseAdmin.from("profiles").insert({
      id: userId,
      username: username.trim().toLowerCase(),
      full_name: fullName.trim(),
      role,
      is_first_login: false,
    });

    if (profileErr) {
      // 回滚：删除刚建好的 Auth 用户
      await supabaseAdmin.auth.admin.deleteUser(userId);
      throw profileErr;
    }

    return NextResponse.json({ success: true, email });
  } catch (err: any) {
    console.error("[create-admin]", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { USE_LOCAL_DB, sql } from "@/lib/db";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireAdmin, validatePassword } from "@/lib/auth";

export async function POST(req: Request) {
  try {
    const { userId, newPassword } = await req.json();

    if (!userId || !newPassword) {
      return NextResponse.json({ error: "缺少必要参数" }, { status: 400 });
    }

    // 密码强度校验
    const passwordCheck = validatePassword(newPassword);
    if (!passwordCheck.valid) {
      return NextResponse.json({ error: passwordCheck.error }, { status: 400 });
    }

    // 权限检查：只有管理员可以重置他人密码
    const { response } = await requireAdmin(req);
    if (response) {
      return response;
    }

    // 生成新密码哈希
    const passwordHash = await bcrypt.hash(newPassword, 10);

    if (USE_LOCAL_DB && sql) {
      // 本地 PostgreSQL 模式
      const result = await sql`
        UPDATE profiles 
        SET password_hash = ${passwordHash}, updated_at = NOW()
        WHERE id = ${userId}
        RETURNING id, username, full_name
      `;
      if (!result || result.length === 0) {
        return NextResponse.json({ error: "用户不存在" }, { status: 404 });
      }
      const profile = result[0];
      return NextResponse.json({ 
        success: true, 
        message: "密码已重置",
        user: {
          id: profile.id,
          username: profile.username,
          full_name: profile.full_name
        }
      });
    } else {
      // Supabase 模式
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
    }
  } catch (err: unknown) {
    console.error("[reset-password]", err);
    return NextResponse.json({ error: '操作失败' }, { status: 500 });
  }
}

import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { USE_LOCAL_DB, sql } from '@/lib/db';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAuth, validatePassword } from '@/lib/auth';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { userId, oldPassword, newPassword } = body;

    if (!userId || !oldPassword || !newPassword) {
      return NextResponse.json(
        { error: '缺少必要参数' },
        { status: 400 }
      );
    }

    // 从 Cookie JWT 获取当前用户
    const { user, response } = await requireAuth(req);
    if (response) {
      return response;
    }

    // 权限检查：用户只能修改自己的密码
    if (user!.id !== userId) {
      return NextResponse.json(
        { error: '无权限修改他人密码' },
        { status: 403 }
      );
    }

    // 密码强度校验
    const passwordCheck = validatePassword(newPassword);
    if (!passwordCheck.valid) {
      return NextResponse.json(
        { error: passwordCheck.error },
        { status: 400 }
      );
    }

    // 哈希新密码
    const newPasswordHash = await bcrypt.hash(newPassword, 10);

    // 执行密码修改
    if (USE_LOCAL_DB && sql) {
      try {
        // 1. 查询现有密码
        const result = await sql`
          SELECT password_hash FROM profiles WHERE id = ${userId} LIMIT 1
        `;

        if (!result || result.length === 0) {
          return NextResponse.json(
            { error: '用户不存在' },
            { status: 404 }
          );
        }

        // 2. 验证旧密码
        const isOldPasswordValid = await bcrypt.compare(oldPassword, result[0].password_hash || '');
        if (!isOldPasswordValid) {
          return NextResponse.json(
            { error: '旧密码错误' },
            { status: 401 }
          );
        }

        // 3. 更新数据库
        await sql`
          UPDATE profiles 
          SET password_hash = ${newPasswordHash},
              is_first_login = false,
              updated_at = NOW()
          WHERE id = ${userId}
        `;

        console.log('[change-password] 本地数据库: 密码已修改');
        return NextResponse.json({ success: true, message: '密码修改成功' });
      } catch (err: unknown) {
        console.error('[change-password] 本地数据库操作失败:', err);
        return NextResponse.json(
          { error: '修改密码失败' },
          { status: 500 }
        );
      }
    } else {
      try {
        // 1. 查询现有密码
        const { data: profile, error: profileErr } = await supabaseAdmin
          .from('profiles')
          .select('password_hash')
          .eq('id', userId)
          .single();

        if (profileErr || !profile) {
          return NextResponse.json(
            { error: '用户不存在' },
            { status: 404 }
          );
        }

        // 2. 验证旧密码
        const isOldPasswordValid = await bcrypt.compare(oldPassword, profile.password_hash || '');
        if (!isOldPasswordValid) {
          return NextResponse.json(
            { error: '旧密码错误' },
            { status: 401 }
          );
        }

        // 3. 更新数据库
        const { error: updateErr } = await supabaseAdmin
          .from('profiles')
          .update({
            password_hash: newPasswordHash,
            is_first_login: false,
            updated_at: new Date().toISOString()
          })
          .eq('id', userId);

        if (updateErr) {
          throw updateErr;
        }

        console.log('[change-password] Supabase: 密码已修改');
        return NextResponse.json({ success: true, message: '密码修改成功' });
      } catch (err: unknown) {
        console.error('[change-password] Supabase 操作失败:', err);
        return NextResponse.json(
          { error: '修改密码失败' },
          { status: 500 }
        );
      }
    }
  } catch (err: unknown) {
    console.error('[change-password] API 错误:', err);
    return NextResponse.json(
      { error: '系统错误' },
      { status: 500 }
    );
  }
}

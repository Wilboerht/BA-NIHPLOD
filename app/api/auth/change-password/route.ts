import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { sql, checkActionRateLimit } from '@/lib/db';
import { createToken, requireAuth, setAuthCookie, validatePassword } from '@/lib/auth';
import { readJsonBody } from '@/lib/api-utils';
import { actorFromUser, writeAudit } from '@/lib/audit';
import { isUuid } from '@/lib/validation';

export async function POST(req: Request) {
  try {
    const { data: body, response: bodyError } = await readJsonBody<{
      userId?: string;
      oldPassword?: string;
      newPassword?: string;
    }>(req);
    if (bodyError) return bodyError;

    const { userId, oldPassword, newPassword } = body!;

    if (
      !isUuid(userId)
      || typeof oldPassword !== 'string'
      || typeof newPassword !== 'string'
      || !oldPassword
      || !newPassword
      || oldPassword.length > 1024
      || newPassword.length > 1024
    ) {
      return NextResponse.json(
        { error: '缺少必要参数' },
        { status: 400 }
      );
    }

    // 从 Cookie JWT 获取当前用户（首次登录也允许改密）
    const { user, response } = await requireAuth(req, { allowFirstLogin: true });
    if (response) {
      return response;
    }

    if (user!.auth_source === 'sso') {
      return NextResponse.json(
        { error: '主站管理员密码请在主站修改', code: 'MANAGED_BY_MAIN_SITE' },
        { status: 409 }
      );
    }

    // 权限检查：用户只能修改自己的密码
    if (user!.id !== userId) {
      return NextResponse.json(
        { error: '无权限修改他人密码' },
        { status: 403 }
      );
    }

    // 防止暴力尝试旧密码
    const allowed = await checkActionRateLimit(`auth:change-password:${user!.id}`, 5, 5 * 60 * 1000);
    if (!allowed) {
      return NextResponse.json({ error: '操作过于频繁，请稍后再试' }, { status: 429 });
    }

    // 密码强度校验
    const passwordCheck = validatePassword(newPassword);
    if (!passwordCheck.valid) {
      return NextResponse.json(
        { error: passwordCheck.error },
        { status: 400 }
      );
    }

    // 新密码不能与旧密码相同
    if (oldPassword === newPassword) {
      return NextResponse.json(
        { error: '新密码不能与旧密码相同' },
        { status: 400 }
      );
    }

    // 执行密码修改
    try {
      // 1. 查询现有密码
      const result = await sql`
        SELECT password_hash FROM profiles WHERE id = ${userId} AND deleted_at IS NULL LIMIT 1
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

      // 3. 哈希新密码并更新数据库；token_version +1 使旧 Token 全部失效
      const newPasswordHash = await bcrypt.hash(newPassword, 12);
      let nextTokenVersion = 0;
      await sql.begin(async (tx) => {
        const updated = await tx`
          UPDATE profiles
          SET password_hash = ${newPasswordHash},
              is_first_login = false,
              updated_at = NOW(),
              token_version = token_version + 1
          WHERE id = ${userId} AND deleted_at IS NULL
          RETURNING token_version
        `;
        if (!updated || updated.length === 0) {
          throw new Error('USER_NOT_FOUND');
        }
        nextTokenVersion = Number(updated[0].token_version);
        await writeAudit(tx, {
          actor: actorFromUser(user),
          action: 'CHANGE_PASSWORD',
          targetType: 'profile',
          targetId: userId,
          comment: '用户修改密码，旧 Token 已失效',
          reason: 'user_changed_password',
          request: req,
        });
      });

      const token = await createToken({
        id: user!.id,
        username: user!.username,
        phone: user!.phone,
        full_name: user!.full_name,
        role: user!.role,
        is_banned: false,
        is_first_login: false,
        token_version: nextTokenVersion,
      });

      console.log('[change-password] 密码已修改');
      const response = NextResponse.json(
        { success: true, message: '密码修改成功' },
        { headers: { 'Cache-Control': 'no-store' } }
      );
      response.headers.set('Set-Cookie', setAuthCookie(token));
      return response;
    } catch (err: unknown) {
      console.error('[change-password] 数据库操作失败:', err);
      return NextResponse.json(
        { error: '修改密码失败' },
        { status: 500 }
      );
    }
  } catch (err: unknown) {
    console.error('[change-password] API 错误:', err);
    return NextResponse.json(
      { error: '系统错误' },
      { status: 500 }
    );
  }
}

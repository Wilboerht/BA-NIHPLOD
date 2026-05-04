import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getProfileById } from '@/lib/db';

export async function GET(request: Request) {
  try {
    const { user, response } = await requireAuth(request);
    if (response) {
      return response;
    }

    // 从数据库获取最新用户信息
    const { data: profile, error } = await getProfileById(user!.id);
    if (error || !profile) {
      return NextResponse.json(
        { error: '用户不存在' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      user: {
        id: profile.id,
        phone: profile.phone,
        username: profile.username,
        full_name: profile.full_name,
        role: profile.role,
        is_first_login: profile.is_first_login,
      }
    });
  } catch (err: unknown) {
    console.error('[auth/me] Error:', err);
    return NextResponse.json(
      { error: '获取用户信息失败' },
      { status: 500 }
    );
  }
}

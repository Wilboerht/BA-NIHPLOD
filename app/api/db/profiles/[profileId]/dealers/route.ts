import { NextResponse } from 'next/server';
import { getDealersByProfileId } from '@/lib/db';
import { requireAuth } from '@/lib/auth';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ profileId: string }> }
) {
  try {
    // 鉴权：必须登录
    const { user, response } = await requireAuth(req);
    if (response) {
      return response;
    }

    const { profileId } = await params;

    if (!profileId) {
      return NextResponse.json(
        { error: '缺少用户标识' },
        { status: 400 }
      );
    }

    // 权限控制：普通用户只能查自己的经销商，管理员可以查任意
    const allowedRoles = ['SUPER_ADMIN', 'AUDITOR', 'MANAGER', 'PROJECT_MANAGER'];
    if (user!.id !== profileId && !allowedRoles.includes(user!.role)) {
      return NextResponse.json(
        { error: '无权查看该用户的经销商信息' },
        { status: 403 }
      );
    }

    const { data, error } = await getDealersByProfileId(profileId);

    if (error) {
      return NextResponse.json(
        { error: error.message || '获取经销商信息失败' },
        { status: 500 }
      );
    }

    return NextResponse.json({ data: data || [] });
  } catch (err: unknown) {
    console.error('[API] Get dealers by profile error:', err);
    return NextResponse.json(
      { error: '获取经销商信息失败' },
      { status: 500 }
    );
  }
}

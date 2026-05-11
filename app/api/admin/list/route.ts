import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { requireAdmin } from '@/lib/auth';

export async function GET(req: Request) {
  try {
    // 权限检查：只有管理员可以查看管理员列表
    const { response } = await requireAdmin(req);
    if (response) {
      return response;
    }

    try {
      const result = await sql`
        SELECT id, username, full_name, phone, role, is_first_login, is_banned, created_at, updated_at
        FROM profiles 
        WHERE role != 'DEALER'
        ORDER BY role ASC
      `;
      console.log('[admin-list] 获取管理员列表成功，数量:', result?.length ?? 0);
      return NextResponse.json({ data: result || [] });
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.error('[admin-list] 数据库错误:', errorMessage);
      // 在开发环境下返回更详细的错误信息，便于排查
      const isDev = process.env.NODE_ENV !== 'production';
      return NextResponse.json(
        {
          error: '操作失败',
          detail: isDev ? errorMessage : undefined,
        },
        { status: 500 }
      );
    }
  } catch (err: unknown) {
    console.error('[admin-list] API 错误:', err);
    return NextResponse.json(
      { error: '操作失败' },
      { status: 500 }
    );
  }
}

import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { requireSuperAdmin } from '@/lib/auth';

export async function GET(req: Request) {
  try {
    const { response } = await requireSuperAdmin(req);
    if (response) {
      return response;
    }

    const { searchParams } = new URL(req.url);
    const page = Math.max(parseInt(searchParams.get('page') || '1', 10), 1);
    const pageSize = Math.min(Math.max(parseInt(searchParams.get('pageSize') || '50', 10), 1), 200);
    const offset = (page - 1) * pageSize;

    try {
      const [result, countRes] = await Promise.all([
        sql`
          SELECT id, username, full_name, phone, role, is_first_login, is_banned, created_at, updated_at
          FROM profiles
          WHERE deleted_at IS NULL
          ORDER BY role ASC
          LIMIT ${pageSize} OFFSET ${offset}
        `,
        sql`SELECT COUNT(*) as count FROM profiles WHERE deleted_at IS NULL`,
      ]);

      const total = parseInt(String(countRes[0]?.count || 0), 10);

      console.log('[admin-list] 获取管理员列表成功，数量:', result?.length ?? 0);
      return NextResponse.json({ data: result || [], total, page, pageSize });
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.error('[admin-list] 数据库错误:', errorMessage);
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

import { NextResponse } from 'next/server';
import { USE_LOCAL_DB, sql } from '@/lib/db';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAdmin } from '@/lib/auth';

export async function GET(req: Request) {
  try {
    // 权限检查：只有管理员可以查看管理员列表
    const { response } = await requireAdmin(req);
    if (response) {
      return response;
    }

    if (USE_LOCAL_DB && sql) {
      try {
        const result = await sql`
          SELECT * FROM profiles 
          WHERE role != 'DEALER'
          ORDER BY role ASC
        `;
        console.log('[admin-list] 本地数据库: 获取管理员列表');
        return NextResponse.json({ data: result || [] });
      } catch (err: any) {
        console.error('[admin-list] 本地数据库错误:', err);
        return NextResponse.json(
          { error: err.message },
          { status: 500 }
        );
      }
    } else {
      try {
        const { data, error } = await supabaseAdmin
          .from('profiles')
          .select('*')
          .neq('role', 'DEALER')
          .order('role', { ascending: true });

        if (error) throw error;
        console.log('[admin-list] Supabase: 获取管理员列表');
        return NextResponse.json({ data: data || [] });
      } catch (err: any) {
        console.error('[admin-list] Supabase 错误:', err);
        return NextResponse.json(
          { error: err.message },
          { status: 500 }
        );
      }
    }
  } catch (err: any) {
    console.error('[admin-list] API 错误:', err);
    return NextResponse.json(
      { error: err.message },
      { status: 500 }
    );
  }
}

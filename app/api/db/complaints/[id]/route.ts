import { NextResponse } from 'next/server';
import { USE_LOCAL_DB, sql } from '@/lib/db';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAdmin } from '@/lib/auth';

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { status, review_note } = await req.json();

    if (!id || !status) {
      return NextResponse.json(
        { error: '缺少必要参数' },
        { status: 400 }
      );
    }

    // 权限检查
    const { user, response } = await requireAdmin(req);
    if (response) {
      return response;
    }

    // 更新投诉状态
    if (USE_LOCAL_DB && sql) {
      try {
        await sql`
          UPDATE complaints 
          SET status = ${status},
              review_note = ${review_note || null},
              handler_id = ${user!.id},
              updated_at = NOW()
          WHERE id = ${id}
        `;
        console.log('[complaints-update] 本地数据库: 投诉已更新');
        return NextResponse.json({ success: true });
      } catch (err: any) {
        console.error('[complaints-update] 本地数据库错误:', err);
        return NextResponse.json(
          { error: err.message },
          { status: 500 }
        );
      }
    } else {
      try {
        const { error } = await supabaseAdmin
          .from('complaints')
          .update({
            status,
            review_note,
            handler_id: user!.id,
            updated_at: new Date().toISOString()
          })
          .eq('id', id);

        if (error) throw error;
        console.log('[complaints-update] Supabase: 投诉已更新');
        return NextResponse.json({ success: true });
      } catch (err: any) {
        console.error('[complaints-update] Supabase 错误:', err);
        return NextResponse.json(
          { error: err.message },
          { status: 500 }
        );
      }
    }
  } catch (err: any) {
    console.error('[complaints-update] API 错误:', err);
    return NextResponse.json(
      { error: err.message },
      { status: 500 }
    );
  }
}

import { NextResponse } from 'next/server';
import { clearAuthCookie, verifyToken } from '@/lib/auth';
import { sql } from '@/lib/db';

export async function POST(req: Request) {
  try {
    // 将当前 Token 加入黑名单，使注销后的 Token 立即失效
    const payload = await verifyToken(req);
    if (payload?.jti) {
      // Token 有效期 8 小时，黑名单过期时间与之保持一致，到期自动清理
      const expAt = new Date(Date.now() + 8 * 60 * 60 * 1000);
      await sql`
        INSERT INTO token_blacklist (jti, exp_at)
        VALUES (${payload.jti}, ${expAt})
        ON CONFLICT (jti) DO NOTHING
      `;
    }
  } catch {
    // 即使黑名单写入失败，也继续清除 Cookie
  }

  const response = NextResponse.json({ success: true });
  response.headers.set('Set-Cookie', clearAuthCookie());
  return response;
}

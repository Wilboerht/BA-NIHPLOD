import { NextResponse } from 'next/server';
import { clearAuthCookie, verifyToken } from '@/lib/auth';
import { sql } from '@/lib/db';

export async function POST(req: Request) {
  try {
    // 将当前 Token 加入黑名单，使注销后的 Token 立即失效
    const payload = await verifyToken(req);
    if (payload?.jti) {
      // exp 为 24 小时后，黑名单记录也设置相同过期时间
      const expAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
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

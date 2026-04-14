import { createClient } from "@supabase/supabase-js";

/**
 * 后端专用 Supabase Admin Client
 * 使用 SERVICE_ROLE_KEY，绕过所有 RLS 策略，请谨慎使用
 * 
 * 注意：在本地 PostgreSQL 部署时，这个 client 不会被使用
 * 代码会通过 USE_LOCAL_DB 开关选择本地 SQL 或 Supabase
 */

// 提供兼容的 dummy Supabase client（在纯本地部署时使用）
const getDummyClient = () => {
  return {
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: () => ({ data: null, error: { message: 'Supabase not configured' } }) }), single: () => ({ data: null, error: { message: 'Supabase not configured' } }) }),
      insert: () => ({ select: () => ({ single: () => ({ data: null, error: { message: 'Supabase not configured' } }) }) }),
      update: () => ({ eq: () => ({ data: null, error: { message: 'Supabase not configured' } }) }),
      delete: () => ({ eq: () => ({ data: null, error: { message: 'Supabase not configured' } }) }),
    }),
  } as any;
};

export const supabaseAdmin = 
  process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
    ? createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY,
        {
          auth: {
            autoRefreshToken: false,
            persistSession: false,
          },
        }
      )
    : getDummyClient();

/**
 * 集中化的管理员权限检查逻辑
 */
export async function checkIsAdmin(adminId: string): Promise<boolean> {
  if (!adminId) return false;
  
  try {
    const { data: profile, error } = await supabaseAdmin
      .from('profiles')
      .select('role')
      .eq('id', adminId)
      .single();

    if (error || !profile) return false;

    // 定义允许执行管理操作的角色
    const allowedRoles = ['SUPER_ADMIN', 'AUDITOR', 'MANAGER', 'PROJECT_MANAGER'];
    return allowedRoles.includes(profile.role);
  } catch (error) {
    console.error("[checkIsAdmin] Error:", error);
    return false;
  }
}

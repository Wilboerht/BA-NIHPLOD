import { createClient } from "@supabase/supabase-js";

/**
 * 后端专用 Supabase Admin Client
 * 使用 SERVICE_ROLE_KEY，绕过所有 RLS 策略，请谨慎使用
 */
export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

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

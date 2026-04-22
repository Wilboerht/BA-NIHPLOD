import { createClient } from "@supabase/supabase-js";
import { USE_LOCAL_DB, sql } from "./db";

/**
 * 后端专用 Supabase Admin Client
 * 使用 SERVICE_ROLE_KEY，绕过所有 RLS 策略，请谨慎使用
 * 
 * 注意：在本地 PostgreSQL 部署时，这个 client 不会被使用
 * 代码会通过 USE_LOCAL_DB 开关选择本地 SQL 或 Supabase
 */

// 提供兼容的 dummy Supabase client（在纯本地部署时使用）
const getDummyClient = () => {
  const dummyResponse: any = {
    data: null, 
    error: { message: 'Supabase not configured for local deployment' }
  };
  
  const chainObj: any = {
    eq: () => chainObj,
    single: () => Promise.resolve(dummyResponse),
    maybeSingle: () => Promise.resolve(dummyResponse),
    select: () => chainObj,
    insert: () => chainObj,
    update: () => chainObj,
    delete: () => chainObj,
  };

  // 实现 storage API（用于文件上传）
  const storageChain: any = {
    from: () => ({
      upload: () => Promise.resolve(dummyResponse),
      download: () => Promise.resolve(dummyResponse),
      remove: () => Promise.resolve(dummyResponse),
      list: () => Promise.resolve(dummyResponse),
    }),
  };

  return {
    from: () => chainObj,
    storage: storageChain,
  };
};

// 延迟初始化：避免构建时评估问题
let supabaseAdminInstance: any = null;

function initSupabaseAdmin() {
  if (supabaseAdminInstance !== null) {
    return supabaseAdminInstance;
  }

  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (url && key) {
      supabaseAdminInstance = createClient(url, key, {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      });
    } else {
      supabaseAdminInstance = getDummyClient();
    }
  } catch (error) {
    console.error('[supabase-admin] Initialization error:', error);
    supabaseAdminInstance = getDummyClient();
  }

  return supabaseAdminInstance;
}

// 使用 Proxy 进行延迟初始化
export const supabaseAdmin = new Proxy({}, {
  get(target: any, prop: string) {
    const instance = initSupabaseAdmin();
    return instance[prop];
  },
  apply(target: any, thisArg: any, args: any[]) {
    const instance = initSupabaseAdmin();
    return instance(...args);
  },
}) as any;

/**
 * 集中化的管理员权限检查逻辑
 */
export async function checkIsAdmin(adminId: string): Promise<boolean> {
  if (!adminId) return false;

  // 本地 PostgreSQL 模式
  if (USE_LOCAL_DB && sql) {
    try {
      const result = await sql`SELECT role FROM profiles WHERE id = ${adminId} LIMIT 1`;
      if (!result[0]) return false;
      const allowedRoles = ['SUPER_ADMIN', 'AUDITOR', 'MANAGER', 'PROJECT_MANAGER'];
      return allowedRoles.includes(result[0].role);
    } catch (err) {
      console.error('[checkIsAdmin] Local DB error:', err);
      return false;
    }
  }

  // Supabase 模式
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return false;
  }

  try {
    const { data: profile, error } = await supabaseAdmin
      .from('profiles')
      .select('role')
      .eq('id', adminId)
      .single();

    if (error || !profile) return false;

    const allowedRoles = ['SUPER_ADMIN', 'AUDITOR', 'MANAGER', 'PROJECT_MANAGER'];
    return allowedRoles.includes(profile.role);
  } catch (error) {
    console.error("[checkIsAdmin] Error:", error);
    return false;
  }
}

import { createClient } from '@supabase/supabase-js';

// 提供兼容的 dummy client
const getDummyClient = () => {
  return {
    auth: { getUser: () => ({ data: { user: null }, error: null }) },
  } as any;
};

// 延迟初始化：避免构建时评估问题
let supabaseInstance: any = null;

function initSupabase() {
  if (supabaseInstance !== null) {
    return supabaseInstance;
  }

  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (supabaseUrl && supabaseAnonKey) {
      supabaseInstance = createClient(supabaseUrl, supabaseAnonKey);
    } else {
      supabaseInstance = getDummyClient();
    }
  } catch (error) {
    console.error('[supabase] Initialization error:', error);
    supabaseInstance = getDummyClient();
  }

  return supabaseInstance;
}

// 使用 Proxy 进行延迟初始化
export const supabase = new Proxy({}, {
  get(target: any, prop: string) {
    const instance = initSupabase();
    return instance[prop];
  },
  apply(target: any, thisArg: any, args: any[]) {
    const instance = initSupabase();
    return instance(...args);
  },
}) as any;

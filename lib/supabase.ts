import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// 提供兼容的 dummy client
const getDummyClient = () => {
  return {
    auth: { getUser: () => ({ data: { user: null }, error: null }) },
  } as any;
};

export const supabase = 
  supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey)
    : getDummyClient();

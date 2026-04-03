import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.resolve(__dirname, '../.env.local');

const envContent = fs.readFileSync(envPath, 'utf8');
const envLines = envContent.split('\n');
envLines.forEach(line => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) {
    if (!process.env[match[1].trim()]) {
      process.env[match[1].trim()] = match[2].trim();
    }
  }
});

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRole);

async function fixDatabasePermissions() {
  console.log("正在修复数据库权限与用户状态...");

  // 1. 添加 RLS 策略 (通过 SQL 运行)
  const { error: sqlError } = await supabaseAdmin.rpc('exec_sql', {
    sql_query: `
      DO $$ 
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_policies WHERE tablename = 'profiles' AND policyname = 'Users can view own profile'
        ) THEN
          CREATE POLICY "Users can view own profile" ON profiles FOR SELECT USING (auth.uid() = id);
        END IF;
      END $$;
    `
  });

  // 如果 rpc 没开，我们就直接更新用户状态试试，或者手动检查
  if (sqlError) {
     console.log("RPC exec_sql 未开启，尝试直接更新用户状态并提示用户手动添加策略。");
  }

  // 2. 将 hank.wang 设置为非首次登录，并确保角色正确
  const { error: updateError } = await supabaseAdmin
    .from('profiles')
    .update({ 
      is_first_login: false,
      role: 'SUPER_ADMIN' 
    })
    .match({ username: 'hank.wang' });

  if (updateError) {
    console.error("更新用户状态失败:", updateError.message);
  } else {
    console.log("✅ 用户 hank.wang@nihplod.cn 已设置为就绪状态（无需强制重置密码）。");
  }

  console.log("\n💡 请务必确保：");
  console.log("1. 使用 hank.wang@nihplod.cn (密码: hank) 登录。");
  console.log("2. 如果还看不到，请检查浏览器 Console 是否有 403 错误（如果是，则需要手动在 Supabase 控制台给 profiles 表加一句 SELECT 策略：auth.uid() = id）。");
}

fixDatabasePermissions();

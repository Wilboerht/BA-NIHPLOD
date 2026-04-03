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

async function forcePromote(email) {
  console.log(`🛠 正在对 ${email} 执行深度权限修复...`);

  // 1. 获取 Auth ID
  const { data: { users }, error: listError } = await supabaseAdmin.auth.admin.listUsers();
  const user = users.find(u => u.email === email);
  
  if (!user) {
    console.error("❌ 错误：Auth 系统中不存在该邮箱。");
    return;
  }

  console.log(`🔗 关联 ID: ${user.id}`);

  // 2. 暴力插入/更新 profile
  const { error: upsertError } = await supabaseAdmin
    .from('profiles')
    .upsert({
      id: user.id,
      username: email.split('@')[0],
      full_name: email.split('@')[0],
      role: 'SUPER_ADMIN',
      updated_at: new Date()
    });

  if (upsertError) {
    console.error("❌ 修复失败:", upsertError);
  } else {
    console.log("✅ 权限修复完成！数据库已更新。");
    console.log("-----------------------------------------");
    console.log("请现在：1. 刷新页面  2. 重新登录");
  }
}

forcePromote('hank.wang@nihplod.cn');

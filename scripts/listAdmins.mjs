import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.resolve(__dirname, '../.env.local');

if (!fs.existsSync(envPath)) {
  console.error("❌ .env.local 文件不存在");
  process.exit(1);
}

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

if (!supabaseUrl || !supabaseServiceRole) {
  console.error("❌ Missing Supabase URL or Service Role key in .env.local");
  process.exit(1);
}

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRole, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function main() {
  try {
    console.log("📋 查询数据库中的所有管理员账户...\n");

    // 查询所有管理员用户
    const { data: admins, error } = await supabaseAdmin
      .from('profiles')
      .select('id, username, full_name, role, is_first_login, created_at')
      .in('role', ['SUPER_ADMIN', 'AUDITOR', 'MANAGER', 'PROJECT_MANAGER']);

    if (error) {
      console.error("❌ 查询失败:", error);
      process.exit(1);
    }

    if (!admins || admins.length === 0) {
      console.log("⚠️  数据库中未找到任何管理员账户！");
      console.log("\n💡 可以运行以下命令创建默认管理员：");
      console.log("   npm run create:admin");
      return;
    }

    console.log(`✅ 找到 ${admins.length} 个管理员账户：\n`);

    admins.forEach((admin, index) => {
      console.log(`${index + 1}. ${admin.full_name || 'N/A'}`);
      console.log(`   📧 Username: ${admin.username}`);
      console.log(`   👤 Role: ${admin.role}`);
      console.log(`   🔐 First Login: ${admin.is_first_login ? '需要重置密码' : '已初始化'}`);
      console.log(`   📅 Created: ${new Date(admin.created_at).toLocaleString('zh-CN')}`);
      console.log();
    });

    // 验证默认账户的密码哈希
    console.log("\n🔍 密码哈希检查：\n");
    const { data: withHashes } = await supabaseAdmin
      .from('profiles')
      .select('username, password_hash')
      .in('role', ['SUPER_ADMIN', 'AUDITOR', 'MANAGER', 'PROJECT_MANAGER']);

    if (withHashes) {
      withHashes.forEach(user => {
        const hasHash = !!user.password_hash;
        const hashPreview = user.password_hash ? user.password_hash.substring(0, 20) + '...' : 'NULL';
        const status = hasHash ? '✅ 有' : '❌ 无';
        console.log(`${user.username}: ${status} - ${hashPreview}`);
      });
    }

  } catch (err) {
    console.error("❌ 发生错误:", err);
    process.exit(1);
  }
}

main();

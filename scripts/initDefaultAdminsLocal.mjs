import postgres from 'postgres';
import bcrypt from 'bcryptjs';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.resolve(__dirname, '../.env.local');

// 加载 .env.local
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach(line => {
    const match = line.match(/^([^#][^=]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      const val = match[2].trim().replace(/^["']|["']$/g, '');
      if (!process.env[key]) process.env[key] = val;
    }
  });
}

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("❌ DATABASE_URL 未设置，请在 .env.local 中配置");
  console.error("   示例: DATABASE_URL=\"postgresql://nihplod_user:Moidas888!@localhost:5432/ba_nihplod_db\"");
  process.exit(1);
}

const sql = postgres(DATABASE_URL);

// 默认管理员配置
const DEFAULT_ADMINS = [
  {
    username: 'hank.wang@nihplod.cn',
    password: 'hank',
    fullName: 'Hank Wang',
    role: 'SUPER_ADMIN'
  },
  {
    username: 'walter@nihplod.cn',
    password: 'walter123',
    fullName: 'Walter',
    role: 'SUPER_ADMIN'
  }
];

async function createOrUpdateAdmin(admin) {
  const { username, password, fullName, role } = admin;

  // 生成密码哈希
  const passwordHash = await bcrypt.hash(password, 10);

  // 检查用户是否存在
  const existing = await sql`
    SELECT id FROM profiles WHERE username = ${username} LIMIT 1
  `;

  try {
    if (existing.length > 0) {
      // 更新现有用户
      await sql`
        UPDATE profiles 
        SET password_hash = ${passwordHash}, 
            full_name = ${fullName}, 
            role = ${role}, 
            is_first_login = false 
        WHERE username = ${username}
      `;
      console.log(`✅ 更新: ${fullName} (${username}) - Role: ${role}`);
    } else {
      // 创建新用户
      await sql`
        INSERT INTO profiles (username, full_name, password_hash, role, is_first_login)
        VALUES (${username}, ${fullName}, ${passwordHash}, ${role}, false)
      `;
      console.log(`✅ 创建: ${fullName} (${username}) - Role: ${role}`);
    }

    return true;
  } catch (err) {
    console.error(`❌ 处理 ${username} 时出错:`, err.message);
    return false;
  }
}

async function main() {
  console.log("🔧 初始化默认管理员账户 (PostgreSQL 本地模式)...\n");

  let successCount = 0;
  for (const admin of DEFAULT_ADMINS) {
    const success = await createOrUpdateAdmin(admin);
    if (success) successCount++;
  }

  console.log(`\n📊 结果: ${successCount}/${DEFAULT_ADMINS.length} 个账户初始化成功\n`);

  if (successCount === DEFAULT_ADMINS.length) {
    console.log("✅ 所有默认管理员账户已准备就绪！\n");
    console.log("📝 可用的默认账户:\n");
    DEFAULT_ADMINS.forEach(admin => {
      console.log(`${admin.fullName} (${admin.role})`);
      console.log(`  📧 用户名: ${admin.username}`);
      console.log(`  🔐 密码: ${admin.password}`);
      console.log();
    });
  } else {
    console.log("⚠️  部分账户初始化失败，请检查错误信息。");
    process.exit(1);
  }

  await sql.end();
}

main();

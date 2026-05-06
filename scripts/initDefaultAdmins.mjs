import bcrypt from 'bcryptjs';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import postgres from 'postgres';

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
      process.env[match[1].trim()] = match[2].trim().replace(/^["']|["']$/g, '');
    }
  }
});

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error("❌ Missing DATABASE_URL in .env.local");
  process.exit(1);
}

const sql = postgres(databaseUrl);

// 默认管理员配置
const DEFAULT_ADMINS = [
  {
    username: 'hank.wang@nihplod.cn',
    password: 'whk35168',
    fullName: 'Hank',
    role: 'SUPER_ADMIN'
  },
  {
    username: 'walter@nihplod.cn',
    password: 'walter',
    fullName: 'Walter',
    role: 'SUPER_ADMIN'
  }
];

async function createOrUpdateAdmin(admin) {
  const { username, password, fullName, role } = admin;

  // 生成密码哈希
  const passwordHash = await bcrypt.hash(password, 10);

  try {
    // 检查用户是否存在
    const existing = await sql`
      SELECT id FROM profiles WHERE username = ${username} LIMIT 1
    `;

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
    console.error(`❌ 处理 ${username} 时出错:`, err);
    return false;
  }
}

async function main() {
  console.log("🔧 初始化默认管理员账户...\n");

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

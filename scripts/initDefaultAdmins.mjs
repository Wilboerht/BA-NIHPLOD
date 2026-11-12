import bcrypt from 'bcryptjs';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import postgres from 'postgres';
import crypto from 'crypto';

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

// 默认管理员配置（从环境变量读取，未设置则不创建）
function getAdminPassword() {
  const envPassword = process.env.ADMIN_INIT_PASSWORD;
  if (envPassword && envPassword.length >= 8) {
    return { password: envPassword, generated: false };
  }

  const randomPassword = crypto.randomBytes(12).toString('hex');
  const passwordFile = path.resolve(process.cwd(), 'admin-init-password.txt');
  fs.writeFileSync(passwordFile, `${randomPassword}\n`, { mode: 0o600 });
  // mode 只在新建文件时生效；显式 chmod 保证覆盖已有文件时仍为 600
  try {
    fs.chmodSync(passwordFile, 0o600);
  } catch {
    // 非 POSIX 平台忽略
  }
  console.log('⚠️  未设置 ADMIN_INIT_PASSWORD，已生成随机密码并写入 admin-init-password.txt');
  return { password: randomPassword, generated: true };
}

function getDefaultAdmins() {
  const adminsEnv = process.env.DEFAULT_ADMINS;
  if (adminsEnv) {
    try {
      return JSON.parse(adminsEnv);
    } catch {
      console.error("❌ DEFAULT_ADMINS 环境变量格式错误，应为 JSON 数组");
      process.exit(1);
    }
  }
  // 默认空数组：强制通过环境变量配置，避免硬编码真实邮箱
  return [];
}

const DEFAULT_ADMINS = getDefaultAdmins();
const resetExisting = process.argv.includes('--reset');

if (DEFAULT_ADMINS.length === 0) {
  console.log("ℹ️  未配置 DEFAULT_ADMINS 环境变量，跳过默认管理员初始化。");
  console.log("   如需初始化，请在 .env.local 中设置：");
  console.log('   DEFAULT_ADMINS=[{"username":"admin@example.com","fullName":"Admin","role":"SUPER_ADMIN"}]');
  await sql.end();
  process.exit(0);
}

async function writeBootstrapAudit(action, profileId, detail) {
  try {
    await sql`
      INSERT INTO audit_logs (target_type, target_id, actor_role, actor_name, action, comment, after)
      VALUES (
        'profile', ${profileId}, 'SYSTEM', 'initDefaultAdmins',
        ${action}, ${detail}, ${JSON.stringify({ action, detail })}::jsonb
      )
    `;
  } catch (err) {
    console.warn(`⚠️  审计日志写入失败 (${action}):`, err instanceof Error ? err.message : err);
  }
}

async function createOrUpdateAdmin(admin, password) {
  const { username, fullName, role } = admin;

  if (!username || !fullName || !role) {
    console.error(`❌ 管理员配置缺少必要字段: ${JSON.stringify(admin)}`);
    return false;
  }

  const normalizedUsername = username.trim();
  const email = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedUsername)
    ? normalizedUsername.toLowerCase()
    : null;

  try {
    // 检查用户是否存在
    const existing = await sql`
      SELECT id, role FROM profiles WHERE username = ${normalizedUsername} AND deleted_at IS NULL LIMIT 1
    `;

    if (existing.length > 0 && !resetExisting) {
      console.log(`ℹ️  已存在，跳过: ${fullName} (${normalizedUsername}) - Role: ${existing[0].role}`);
      console.log("   如需重置密码/角色，请使用 npm run init:admins -- --reset");
      return true;
    }

    const passwordHash = await bcrypt.hash(password, 12);

    if (existing.length > 0) {
      const updated = await sql`
        UPDATE profiles 
        SET password_hash = ${passwordHash},
            full_name = ${fullName},
            email = COALESCE(email, ${email}),
            role = ${role},
            is_first_login = true,
            token_version = token_version + 1,
            updated_at = NOW()
        WHERE username = ${normalizedUsername} AND deleted_at IS NULL
        RETURNING id
      `;
      if (updated.length > 0) {
        await writeBootstrapAudit(
          'BOOTSTRAP_RESET_ADMIN',
          updated[0].id,
          `重置管理员 ${normalizedUsername}（${role}）`
        );
      }
      console.log(`✅ 重置: ${fullName} (${normalizedUsername}) - Role: ${role}`);
    } else {
      const inserted = await sql`
        INSERT INTO profiles (username, full_name, email, password_hash, role, is_first_login)
        VALUES (${normalizedUsername}, ${fullName}, ${email}, ${passwordHash}, ${role}, true)
        RETURNING id
      `;
      if (inserted.length > 0) {
        await writeBootstrapAudit(
          'BOOTSTRAP_CREATE_ADMIN',
          inserted[0].id,
          `创建管理员 ${normalizedUsername}（${role}）`
        );
      }
      console.log(`✅ 创建: ${fullName} (${normalizedUsername}) - Role: ${role}`);
    }

    return true;
  } catch (err) {
    console.error(`❌ 处理 ${username} 时出错:`, err);
    return false;
  }
}

async function main() {
  console.log("🔧 初始化默认管理员账户...\n");

  const { password, generated } = getAdminPassword();

  let successCount = 0;
  for (const admin of DEFAULT_ADMINS) {
    const success = await createOrUpdateAdmin(admin, password);
    if (success) successCount++;
  }

  console.log(`\n📊 结果: ${successCount}/${DEFAULT_ADMINS.length} 个账户初始化成功\n`);

  if (successCount === DEFAULT_ADMINS.length) {
    console.log("✅ 所有默认管理员账户已准备就绪！\n");
    console.log("📝 可用的默认账户:\n");
    DEFAULT_ADMINS.forEach(admin => {
      console.log(`${admin.fullName} (${admin.role})`);
      console.log(`  📧 用户名: ${admin.username}`);
      console.log(`  🔐 密码: ${generated ? '已写入 admin-init-password.txt（权限 600）' : '使用 ADMIN_INIT_PASSWORD 环境变量值'}`);
      console.log();
    });
    console.log("⚠️  出于安全原因不再在终端输出明文密码。\n");
  } else {
    console.log("⚠️  部分账户初始化失败，请检查错误信息。");
    process.exit(1);
  }

  await sql.end();
}

main();

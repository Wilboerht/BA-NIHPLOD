import bcrypt from "bcryptjs";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import postgres from "postgres";
import { generateSecret } from "otplib";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.resolve(__dirname, "../.env.local");

if (!fs.existsSync(envPath)) {
  console.error("缺少 .env.local 文件");
  process.exit(1);
}

for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (!match) continue;
  const key = match[1].trim();
  if (!process.env[key]) {
    process.env[key] = match[2].trim().replace(/^["']|["']$/g, "");
  }
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("缺少 DATABASE_URL");
  process.exit(1);
}

const username = (process.env.BA_BREAK_GLASS_USERNAME || "ba-emergency").trim();
const password =
  process.env.BA_BREAK_GLASS_PASSWORD?.trim() || crypto.randomBytes(18).toString("base64url");
const totpSecret =
  process.env.BA_BREAK_GLASS_TOTP_SECRET?.trim() || generateSecret();

if (!/^[A-Za-z0-9._-]{3,64}$/.test(username)) {
  console.error("BA_BREAK_GLASS_USERNAME 只允许 3-64 位字母、数字、点、下划线、连字符");
  process.exit(1);
}
if (password.length < 16) {
  console.error("应急账号密码至少需要 16 位");
  process.exit(1);
}

const sql = postgres(databaseUrl);
const passwordHash = await bcrypt.hash(password, 12);

try {
  const existing = await sql`
    SELECT id FROM profiles WHERE username = ${username} LIMIT 1
  `;
  if (existing.length > 0) {
    await sql`
      UPDATE profiles
      SET password_hash = ${passwordHash},
          full_name = 'BA 应急管理员',
          role = 'SUPER_ADMIN',
          is_first_login = FALSE,
          is_banned = FALSE,
          deleted_at = NULL,
          auth_source = 'local',
          external_admin_id = NULL,
          external_role = NULL,
          external_token_version = NULL,
          main_totp_enabled = FALSE,
          token_version = token_version + 1,
          updated_at = NOW()
      WHERE id = ${existing[0].id}
    `;
    console.log(`已更新本地应急账号：${username}`);
  } else {
    await sql`
      INSERT INTO profiles (
        username, full_name, email, password_hash, role,
        is_first_login, is_banned, token_version, auth_source
      ) VALUES (
        ${username}, 'BA 应急管理员', NULL, ${passwordHash}, 'SUPER_ADMIN',
        FALSE, FALSE, 0, 'local'
      )
    `;
    console.log(`已创建本地应急账号：${username}`);
  }

  console.log("");
  console.log("请将以下变量加入 BA .env.local 并重启：");
  console.log(`BA_BREAK_GLASS_ENABLED="true"`);
  console.log(`BA_BREAK_GLASS_USERNAME="${username}"`);
  console.log(`BA_BREAK_GLASS_TOTP_SECRET="${totpSecret}"`);
  console.log("");
  console.log("应急账号密码（只显示一次，请立即保存到密码管理器）：");
  console.log(password);
  console.log("");
  console.log("TOTP 二维码 URI（可用任意 TOTP App 导入）：");
  console.log(
    `otpauth://totp/NIHPLOD%20BA%20Emergency?secret=${encodeURIComponent(totpSecret)}&issuer=NIHPLOD&algorithm=SHA1&digits=6&period=30`
  );
} finally {
  await sql.end();
}

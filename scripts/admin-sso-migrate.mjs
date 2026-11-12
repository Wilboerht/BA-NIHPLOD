import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import postgres from "postgres";

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

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const force = args.includes("--force");
const cutover = args.includes("--cutover");
const mappings = [];

for (let i = 0; i < args.length; i += 1) {
  const arg = args[i];
  if (arg === "--map" && args[i + 1]) {
    const [baProfileId, mainAdminId] = args[i + 1].split("=");
    if (!baProfileId || !mainAdminId) {
      console.error(`--map 格式错误: ${args[i + 1]}，应为 <baProfileId>=<mainAdminId>`);
      process.exit(1);
    }
    mappings.push({ baProfileId, mainAdminId });
    i += 1;
  } else if (arg === "--mapping" && args[i + 1]) {
    const file = path.resolve(args[i + 1]);
    if (!fs.existsSync(file)) {
      console.error(`映射文件不存在: ${file}`);
      process.exit(1);
    }
    const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    if (!Array.isArray(parsed)) {
      console.error("映射文件必须是数组");
      process.exit(1);
    }
    for (const item of parsed) {
      if (!item?.baProfileId || !item?.mainAdminId) {
        console.error("映射文件条目缺少 baProfileId 或 mainAdminId");
        process.exit(1);
      }
      mappings.push({ baProfileId: item.baProfileId, mainAdminId: item.mainAdminId });
    }
    i += 1;
  }
}

if (mappings.length === 0) {
  console.error("未提供映射。用法：");
  console.error("  node scripts/admin-sso-migrate.mjs --map <baProfileId>=<mainAdminId> [--map ...] [--apply]");
  console.error("  node scripts/admin-sso-migrate.mjs --mapping admin-sso-mapping.json [--apply]");
  process.exit(1);
}

const sql = postgres(databaseUrl);
let failures = 0;

try {
  for (const { baProfileId, mainAdminId } of mappings) {
    const rows = await sql`
      SELECT id, username, email, role, external_admin_id, auth_source
      FROM profiles
      WHERE id = ${baProfileId} AND deleted_at IS NULL
      LIMIT 1
    `;
    if (rows.length === 0) {
      console.error(`✗ BA profile 不存在或已删除: ${baProfileId}`);
      failures += 1;
      continue;
    }
    const profile = rows[0];
    if (
      profile.external_admin_id &&
      profile.external_admin_id !== mainAdminId &&
      !force
    ) {
      console.error(
        `✗ ${baProfileId} 已绑定其他主站管理员 ${profile.external_admin_id}；确认后可加 --force`
      );
      failures += 1;
      continue;
    }

    const duplicate = await sql`
      SELECT id FROM profiles
      WHERE external_admin_id = ${mainAdminId} AND id <> ${baProfileId}
      LIMIT 1
    `;
    if (duplicate.length > 0) {
      console.error(`✗ 主站管理员 ${mainAdminId} 已绑定其他 BA profile: ${duplicate[0].id}`);
      failures += 1;
      continue;
    }

    console.log(
      `→ ${apply ? "APPLY" : "DRY-RUN"} ${cutover ? "[CUTOVER] " : ""}${baProfileId} (${profile.username || profile.email || "-"}) -> ${mainAdminId}`
    );

    if (apply) {
      if (cutover) {
        await sql`
          UPDATE profiles
          SET external_admin_id = ${mainAdminId},
              auth_source = 'sso',
              is_first_login = FALSE,
              is_banned = FALSE,
              external_token_version = NULL,
              main_totp_enabled = FALSE,
              last_synced_at = NULL,
              token_version = token_version + 1,
              updated_at = NOW()
          WHERE id = ${baProfileId} AND deleted_at IS NULL
        `;
      } else {
        await sql`
          UPDATE profiles
          SET external_admin_id = ${mainAdminId},
              external_token_version = NULL,
              last_synced_at = NULL,
              updated_at = NOW()
          WHERE id = ${baProfileId} AND deleted_at IS NULL
        `;
      }
      await sql`
        INSERT INTO audit_logs (
          actor_role, actor_name, action, target_type, target_id, comment, "after"
        ) VALUES (
          'SYSTEM', 'admin-sso-migrate', 'MIGRATE_ADMIN_TO_SSO', 'profile',
          ${baProfileId}, ${cutover ? '绑定并切换到主站 SSO' : '绑定 BA 管理员到主站 ID（保留本地登录）'},
          ${JSON.stringify({ mainAdminId, cutover, previousExternalAdminId: profile.external_admin_id ?? null })}::jsonb
        )
      `;
      console.log(`✓ 已绑定 ${baProfileId} -> ${mainAdminId}${cutover ? "（已切换 SSO）" : ""}`);
    }
  }

  if (!apply) {
    console.log("");
    console.log("当前为 DRY-RUN；确认无误后追加 --apply 执行。");
  } else {
    console.log("");
    console.log("映射完成。请执行一次主站 SSO 状态同步：");
    console.log("  node scripts/run-cron.mjs /api/cron/admin-sso-sync");
  }
} finally {
  await sql.end();
}

if (failures > 0) process.exitCode = 1;

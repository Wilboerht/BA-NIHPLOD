/**
 * 列出/禁用 BA 历史本地管理员。
 *
 * BA 管理员现在统一由主站 SSO 管理，只保留 break-glass 应急账号。
 * 默认 dry-run；确认映射完成后使用 --apply 禁用其余本地账号（保留审计关联）。
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import postgres from "postgres";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.resolve(__dirname, "../.env.local");

if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const match = line.match(/^([^=]+)=(.*)$/);
    if (!match) continue;
    const key = match[1].trim();
    if (!process.env[key]) {
      process.env[key] = match[2].trim().replace(/^["']|["']$/g, "");
    }
  }
}

if (!process.env.DATABASE_URL) {
  console.error("缺少 DATABASE_URL");
  process.exit(1);
}

const apply = process.argv.includes("--apply");
const breakGlass = (process.env.BA_BREAK_GLASS_USERNAME || "ba-emergency").trim();
const sql = postgres(process.env.DATABASE_URL);

try {
  const rows = await sql`
    SELECT id, username, full_name, role, is_banned, created_at
    FROM profiles
    WHERE auth_source = 'local'
      AND deleted_at IS NULL
      AND username <> ${breakGlass}
    ORDER BY created_at ASC
  `;

  if (rows.length === 0) {
    console.log("没有需要处理的非 break-glass 本地管理员。");
  } else {
    console.log(`发现 ${rows.length} 个历史本地管理员：`);
    for (const row of rows) {
      console.log(
        `- ${row.username} / ${row.full_name || "-"} / ${row.role} / ${
          row.is_banned ? "已禁用" : "正常"
        } / ${row.id}`
      );
    }
    if (!apply) {
      console.log("\n当前为 dry-run。确认这些账号已映射到主站 SSO 后，再执行：");
      console.log("  npm run audit:local-admins -- --apply");
    } else {
      let disabled = 0;
      await sql.begin(async (tx) => {
        for (const row of rows) {
          await tx`
            UPDATE profiles
            SET is_banned = TRUE,
                token_version = token_version + 1,
                updated_at = NOW()
            WHERE id = ${row.id}
              AND auth_source = 'local'
              AND username <> ${breakGlass}
          `;
          await tx`
            INSERT INTO audit_logs (
              target_type, target_id, actor_role, actor_name, action, comment, reason
            ) VALUES (
              'profile', ${row.id}, 'SYSTEM', 'audit-local-admins',
              'DISABLE_LEGACY_LOCAL_ADMIN',
              ${`禁用历史本地管理员 ${row.username}`},
              'managed_by_main_site'
            )
          `;
          disabled += 1;
        }
      });
      console.log(`\n已禁用 ${disabled} 个历史本地管理员，保留 break-glass（${breakGlass}）。`);
    }
  }
} finally {
  await sql.end();
}

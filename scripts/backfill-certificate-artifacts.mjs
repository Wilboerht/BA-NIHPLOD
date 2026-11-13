import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.resolve(__dirname, "../.env.local");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^([^#][^=]*)=(.*)$/);
    if (!match) continue;
    const key = match[1].trim();
    const value = match[2].trim().replace(/^["']|["']$/g, "");
    if (!process.env[key]) process.env[key] = value;
  }
}

const { sql } = await import("../lib/db.ts");
const { backfillCertificateArtifact } =
  await import("../lib/certificate/service.ts");

const apply = process.argv.includes("--apply");
const batchArg = process.argv.find((arg) => arg.startsWith("--batch-size="));
const batchSize = Math.max(1, Number(batchArg?.split("=")[1] || 10));

const rows = await sql`
  SELECT id, cert_number, status, end_date
  FROM certificates
  WHERE deleted_at IS NULL
  ORDER BY created_at ASC
`;

console.log(
  `[backfill] 共 ${rows.length} 张证书，${apply ? "执行" : "dry-run"}`,
);

let created = 0;
let exists = 0;
let skipped = 0;
let failed = 0;

for (let index = 0; index < rows.length; index += batchSize) {
  const batch = rows.slice(index, index + batchSize);
  for (const row of batch) {
    if (!apply) {
      console.log(`[backfill] ${row.cert_number} status=${row.status}`);
      continue;
    }
    try {
      const result = await backfillCertificateArtifact(String(row.id));
      if (result.status === "created") created += 1;
      else if (result.status === "exists") exists += 1;
      else skipped += 1;
      console.log(`[backfill] ${row.cert_number} ${result.status}`);
    } catch (error) {
      failed += 1;
      console.error(`[backfill] ${row.cert_number} failed:`, error);
    }
  }
  if (apply) {
    console.log(
      `[backfill] progress ${Math.min(index + batchSize, rows.length)}/${rows.length}`,
    );
  }
}

console.log(
  `[backfill] done: created=${created} exists=${exists} skipped=${skipped} failed=${failed}`,
);
await sql.end({ timeout: 5 }).catch(() => {});

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

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

const cronPath = process.argv[2] || "/api/cron/admin-sso-sync";
const secret = process.env.CRON_SECRET;
const base = (process.env.CRON_BASE_URL || "http://127.0.0.1:3001").replace(/\/+$/, "");

if (!secret) {
  console.error("缺少 CRON_SECRET");
  process.exit(1);
}

try {
  const response = await fetch(`${base}${cronPath}`, {
    method: "GET",
    headers: { "x-cron-secret": secret },
    signal: AbortSignal.timeout(60_000),
  });
  const text = await response.text();
  console.log(`[run-cron] ${cronPath} HTTP ${response.status}: ${text}`);
  if (!response.ok) process.exitCode = 1;
} catch (error) {
  console.error("[run-cron] 请求失败:", error);
  process.exitCode = 1;
}

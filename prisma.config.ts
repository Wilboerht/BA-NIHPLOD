import { defineConfig } from "prisma/config";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

/**
 * 手动解析 .env 文件（零依赖）
 * Prisma CLI 默认不加载 .env.local，这里手动注入环境变量
 */
function loadEnvFile(filePath: string): void {
  if (!existsSync(filePath)) return;
  const content = readFileSync(filePath, "utf-8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    let value = trimmed.slice(eqIndex + 1).trim();
    // 去除首尾的引号（单引号或双引号）
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    // 只设置尚未存在的环境变量，避免覆盖 shell 中已手动 export 的值
    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

// 自动加载 .env.local
loadEnvFile(resolve(process.cwd(), ".env.local"));

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env["DATABASE_URL"] || "",
  },
});

import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: Date | string | number) {
  return new Date(date).toLocaleDateString("zh-CN", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export function formatDateTime(date: Date | string | number) {
  return new Date(date).toLocaleString("zh-CN", {
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "numeric",
  });
}

/**
 * 将 Date 格式化为 YYYY-MM-DD（本地时区）
 * 避免 toISOString().split('T')[0] 的 UTC 偏移问题
 */
export function formatDateISO(date: Date | string | number): string {
  const d = new Date(date);
  if (isNaN(d.getTime())) return String(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * 解析 auth_scope 字段
 * 存储格式：companyName + " | " + scopeText + " | " + authorizer
 * 注意：scopeText 内部可能包含 " | "，因此不能简单用 split(" | ")
 * 策略：提取第一个 " | " 之前的为 companyName，最后一个 " | " 之后的为 authorizer，中间的全部为 scopeText
 */
/**
 * 安全地解析日期字符串并设置为当天的 23:59:59.999
 * 兼容 YYYY-MM-DD 和 ISO 8601 格式
 */
export function getEndOfDay(dateInput: string | Date): Date {
  const d = typeof dateInput === 'string' ? new Date(dateInput) : new Date(dateInput.getTime());
  if (isNaN(d.getTime())) return d;
  d.setHours(23, 59, 59, 999);
  return d;
}

export function parseAuthScope(authScope: string | undefined | null) {
  if (!authScope) {
    return { companyName: "", scopeText: "", authorizer: "" };
  }
  const firstSep = authScope.indexOf(' | ');
  const lastSep = authScope.lastIndexOf(' | ');

  if (firstSep === -1) {
    return { companyName: authScope, scopeText: "", authorizer: "" };
  }

  const companyName = authScope.substring(0, firstSep);

  if (lastSep === -1 || firstSep === lastSep) {
    // 只有一个分隔符，后面全部当作 scopeText
    return { companyName, scopeText: authScope.substring(firstSep + 3), authorizer: "" };
  }

  const scopeText = authScope.substring(firstSep + 3, lastSep);
  const authorizer = authScope.substring(lastSep + 3);

  return { companyName, scopeText, authorizer };
}

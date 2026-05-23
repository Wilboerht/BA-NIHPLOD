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
 * 解析 auth_scope 字段
 * 存储格式：companyName + " | " + scopeText + " | " + authorizer
 * 注意：scopeText 内部可能包含 " | "，因此不能简单用 split(" | ")
 * 策略：提取第一个 " | " 之前的为 companyName，最后一个 " | " 之后的为 authorizer，中间的全部为 scopeText
 */
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

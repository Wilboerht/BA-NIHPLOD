/** PostgreSQL regexp_replace 模式：匹配所有非数字字符。 */
export const NON_DIGIT_PATTERN = "\\D";

/** 提取手机号数字；仅用于展示/测试辅助，不替代数据库侧精确匹配。 */
export function normalizeContactPhone(value: string): string {
  return value.replace(/\D/g, "");
}

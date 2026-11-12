/**
 * 认证 Cookie 名称。
 * 生产环境使用 __Host- 前缀：Secure + Path=/ + 无 Domain，防止子域 Cookie tossing。
 * 开发环境保持原名称，避免本地 HTTP 下浏览器拒绝 Secure Cookie。
 */
export const AUTH_TOKEN_COOKIE =
  process.env.NODE_ENV === 'production' ? '__Host-auth-token' : 'auth-token';

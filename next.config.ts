import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";

// 生产环境移除 'unsafe-eval'（仅开发环境需要）；GA 域名按需放行
const scriptSrc = isDev
  ? "'self' 'unsafe-eval' 'unsafe-inline'"
  : "'self' 'unsafe-inline' https://www.googletagmanager.com https://www.google-analytics.com";

const connectSrc = isDev
  ? "'self' https://cloudflareinsights.com ws: wss:"
  : "'self' https://cloudflareinsights.com https://www.google-analytics.com https://*.google-analytics.com https://*.analytics.google.com https://www.googletagmanager.com";

const csp = [
  "default-src 'self'",
  `script-src ${scriptSrc}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' blob: data: https://www.google-analytics.com",
  "font-src 'self'",
  `connect-src ${connectSrc}`,
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ") + ";";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "X-DNS-Prefetch-Control",
            value: "on",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          {
            key: "Content-Security-Policy",
            value: csp,
          },
          {
            key: "Permissions-Policy",
            value:
              "camera=(self), microphone=(), geolocation=(), payment=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;

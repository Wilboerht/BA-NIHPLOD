import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://ba.nihplod.cn";
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/"],
        disallow: [
          "/workbench",
          "/workbench/",
          "/admin",
          "/admin/",
          "/demo",
          "/demo/",
          "/api/",
          "/reset-password",
          "/reset-password/",
        ],
      },
      {
        userAgent: "GPTBot",
        disallow: ["/workbench", "/workbench/", "/admin", "/admin/", "/api/"],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}

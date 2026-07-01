import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://ba.nihplod.cn";
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/verify", "/verify/"],
        disallow: [
          "/workbench/",
          "/admin/",
          "/demo/",
          "/api/",
          "/result/",
          "/reset-password/",
        ],
      },
      {
        userAgent: "GPTBot",
        disallow: ["/workbench/", "/admin/", "/api/"],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}

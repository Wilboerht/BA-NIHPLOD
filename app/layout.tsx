import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import ToastProvider from "@/components/ui/ToastProvider";
import { BRAND_NAME, BRAND_NAME_CN, COMPANY_FULL_NAME } from "@/lib/config";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || "https://ba.nihplod.cn";

export const metadata: Metadata = {
  title: {
    default: `${BRAND_NAME} | 授权与防伪验证 — 品牌授权书真伪查询`,
    template: `%s | ${BRAND_NAME} 授权核验`,
  },
  description: `${BRAND_NAME}（${BRAND_NAME_CN}）官方品牌授权资质核验平台。${COMPANY_FULL_NAME} 运营，提供经销商授权书真伪查询、有效期验证及授权范围确认服务。`,
  keywords: [
    "NIHPLOD", "旎柏", "授权验证", "授权书查询", "品牌授权",
    "真伪验证", "经销商查询", "授权资质", "防伪验证", "证书核验",
    "NIHPLOD授权", "旎柏授权", "品牌授权书查询",
  ],
  authors: [{ name: COMPANY_FULL_NAME, url: "https://nihplod.cn" }],
  creator: COMPANY_FULL_NAME,
  publisher: COMPANY_FULL_NAME,
  metadataBase: new URL(BASE_URL),
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    locale: "zh_CN",
    url: BASE_URL,
    siteName: `${BRAND_NAME} 授权核验`,
    title: `${BRAND_NAME} | 品牌授权资质官方核查`,
    description: `输入授权编号即可验证${BRAND_NAME}经销商授权书的真实性。`,
    images: [
      {
        url: "/NIHPLOD-logo.svg",
        width: 512,
        height: 512,
        alt: `${BRAND_NAME} Logo`,
      },
    ],
  },
  twitter: {
    card: "summary",
    title: `${BRAND_NAME} | 授权资质官方核查`,
    description: "品牌授权书真伪查询平台",
    images: ["/NIHPLOD-logo.svg"],
  },
  robots: {
    index: true,
    follow: true,
  },
  manifest: "/manifest.json",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="zh-CN"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        {/* JSON-LD 结构化数据：Organization */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "Organization",
              name: `${BRAND_NAME} ${BRAND_NAME_CN}`,
              url: "https://nihplod.cn",
              description: `${BRAND_NAME}（${BRAND_NAME_CN}）品牌授权管理与防伪验证平台`,
              foundingDate: "2024",
              contactPoint: {
                "@type": "ContactPoint",
                contactType: "customer service",
                availableLanguage: ["Chinese"],
              },
            }),
          }}
        />
        {/* JSON-LD 结构化数据：WebApplication */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "WebApplication",
              name: `${BRAND_NAME} 授权核验中心`,
              url: BASE_URL,
              description: `${BRAND_NAME} 品牌授权书真伪验证平台`,
              applicationCategory: "BusinessApplication",
              operatingSystem: "All",
              offers: {
                "@type": "Offer",
                price: "0",
                priceCurrency: "CNY",
              },
            }),
          }}
        />
        {/* JSON-LD 结构化数据：FAQ（优化 Google SGE 展示）*/}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "FAQPage",
              mainEntity: [
                {
                  "@type": "Question",
                  name: `如何验证${BRAND_NAME}经销商授权书的真伪？`,
                  acceptedAnswer: {
                    "@type": "Answer",
                    text: `在 ${BRAND_NAME} 授权核验平台（${BASE_URL}）输入授权证书编号（SN）、店铺名称或公司名称，即可实时查询授权状态、有效期及经营范围。`,
                  },
                },
                {
                  "@type": "Question",
                  name: `${BRAND_NAME}授权证书编号格式是什么？`,
                  acceptedAnswer: {
                    "@type": "Answer",
                    text: `${BRAND_NAME} 授权证书编号格式为 BAVP-YYYY-XXXX，例如 BAVP-2026-A1B2。您可以在证书图片或授权书上找到此编号。`,
                  },
                },
                {
                  "@type": "Question",
                  name: `${BRAND_NAME}是哪个国家的品牌？`,
                  acceptedAnswer: {
                    "@type": "Answer",
                    text: `${BRAND_NAME}（${BRAND_NAME_CN}）由 ${COMPANY_FULL_NAME} 运营，是一个专注于护肤/美妆领域的品牌。`,
                  },
                },
              ],
            }),
          }}
        />
      </head>
      <body className="min-h-full flex flex-col" suppressHydrationWarning>
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}

import type { Metadata } from "next";
import { BRAND_NAME, BRAND_NAME_CN, COMPANY_FULL_NAME } from "@/lib/config";
import HomeClient from "./home-client";

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || "https://ba.nihplod.cn";

export const metadata: Metadata = {
  title: `${BRAND_NAME} | 授权资质官方核查 — 品牌授权书真伪验证`,
  description: `${BRAND_NAME}（${BRAND_NAME_CN}）官方授权资质核验平台。输入授权编号、店铺或公司名称，即可验证${BRAND_NAME}经销商授权书的真实性、有效期及授权范围。`,
  keywords: [
    "NIHPLOD", "旎柏", "授权验证", "授权书查询", "品牌授权",
    "真伪验证", "经销商查询", "授权资质", "防伪验证", "证书核验",
  ],
  authors: [{ name: COMPANY_FULL_NAME }],
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
    title: `${BRAND_NAME} | 授权资质官方核查`,
    description: `输入授权编号即可验证${BRAND_NAME}经销商授权书的真实性。官方品牌授权管理与防伪验证平台。`,
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: `${BRAND_NAME} Logo`,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: `${BRAND_NAME} | 授权资质官方核查`,
    description: `输入授权编号即可验证${BRAND_NAME}经销商授权书的真实性。`,
    images: ["/og-image.png"],
  },
  robots: {
    index: true,
    follow: true,
    "max-video-preview": -1,
    "max-image-preview": "large",
    "max-snippet": -1,
  },
};

export default function HomePage() {
  return (
    <>
      {/* 搜索引擎友好：语义化隐藏描述 */}
      <section aria-label="平台介绍" style={{ display: "none" }}>
        <h1>{BRAND_NAME}（{BRAND_NAME_CN}）品牌授权资质官方核查平台</h1>
        <p>
          {BRAND_NAME} 由 {COMPANY_FULL_NAME} 运营。本平台提供品牌授权书的真伪验证服务，
          支持按授权编号（SN）、店铺名称或公司名称查询经销商授权状态、有效期及经营范围。
          消费者和合作伙伴可通过本平台确认经销商是否持有有效的 {BRAND_NAME} 品牌授权。
        </p>
      </section>

      {/* 客户端交互层 */}
      <HomeClient />
    </>
  );
}

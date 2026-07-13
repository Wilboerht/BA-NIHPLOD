import type { Metadata } from "next";
import { Suspense } from "react";
import { BRAND_NAME, BRAND_NAME_CN, COMPANY_FULL_NAME } from "@/lib/config";
import HomeClient from "./home-client";

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || "https://ba.nihplod.cn";

export const metadata: Metadata = {
  title: {
    absolute: `${BRAND_NAME} | 授权资质官方核查`,
  },
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
    <Suspense fallback={<div className="h-screen bg-[#F6F4F0]" />}>
      <HomeClient />
    </Suspense>
  );
}

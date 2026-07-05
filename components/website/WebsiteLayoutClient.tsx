"use client";

import { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { WebsiteNavbar } from "@/components/website/WebsiteNavbar";

/**
 * WebsiteLayoutClient
 *
 * 作用：
 * 1. 在公开页面（非 admin/workbench）上渲染全局导航栏
 * 2. 为页面内容提供顶部 padding 以避免被 fixed 导航栏遮挡
 */
export function WebsiteLayoutClient({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  // 管理后台和登录页面不显示公共导航栏
  const isAdminRoute =
    pathname.startsWith("/admin") || pathname.startsWith("/workbench");

  if (isAdminRoute) {
    return <>{children}</>;
  }

  return (
    <>
      <WebsiteNavbar />
      {/* 顶部留白补偿 fixed 导航栏高度 (py-5=68px / md:py-7=92px) */}
      <div className="pt-[68px] md:pt-[92px]">{children}</div>
    </>
  );
}

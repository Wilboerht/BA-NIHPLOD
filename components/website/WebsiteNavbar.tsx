"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { Menu, X, ExternalLink, User, LogOut, ShieldCheck } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { BRAND_NAME_CN } from "@/lib/config";

export function WebsiteNavbar() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const { user, logout } = useAuth();
  const pathname = usePathname();
  const isHome = pathname === "/";

  // 滚动检测：超过 10px 添加毛玻璃效果
  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 10);
    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // 打开移动端菜单时锁定背景滚动 + 自动聚焦关闭按钮
  useEffect(() => {
    if (mobileMenuOpen) {
      document.body.style.overflow = "hidden";
      // 等待面板 DOM 渲染完成后聚焦关闭按钮
      requestAnimationFrame(() => closeButtonRef.current?.focus());
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileMenuOpen]);

  const handleNavClick = () => setMobileMenuOpen(false);

  const userDisplayName = user?.full_name || user?.username || user?.phone || "用户";
  const userInitial = userDisplayName.charAt(0).toUpperCase();

  return (
    <>
      {/* ========== 桌面端 + 移动端导航栏 ========== */}
      <nav
        aria-label="主导航"
        className={`fixed top-0 left-0 right-0 z-[100] grid place-items-center px-6 md:px-12 lg:px-20 py-5 md:py-7 transition-[background-color,border-color,box-shadow] duration-500 ${
          scrolled
            ? "bg-[#EAE5DA]/70 backdrop-blur-md border-b border-black/[0.04]"
            : "bg-[#EAE5DA] border-b border-transparent"
        }`}
      >
        <div className="w-full flex items-center justify-between gap-4">
          {/* 左侧：Logo + 品牌名 */}
          <Link
            href="/"
            className="flex items-center gap-3 md:gap-4 shrink-0 opacity-80 hover:opacity-100 transition-opacity duration-500"
          >
            <Image
              src="/NIHPLOD-logo.svg"
              alt="NIHPLOD"
              width={0}
              height={0}
              className="h-7 md:h-9 w-auto object-contain"
              style={{ display: "block" }}
              priority
              unoptimized
            />
            <div className="hidden sm:block w-px h-4 md:h-5 bg-slate-300/60" />
            <span className="hidden sm:inline text-[13px] md:text-[15px] font-medium tracking-[0.2em] uppercase text-[#13263D] leading-none">
              授权核验平台
            </span>
          </Link>

          {/* 右侧操作区 */}
          <div className="flex items-center gap-2 md:gap-4">
            {/* 旎柏中国官网 - 桌面端 */}
            <a
              href="https://nihplod.cn"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="前往旎柏中国官网（新窗口打开）"
              className="group hidden md:flex items-center gap-2 px-3.5 py-2 rounded-full bg-[#8B7355]/5 hover:bg-[#8B7355]/10 border border-[#8B7355]/10 text-sm font-medium tracking-[0.1em] text-[#8B7355]/80 hover:text-[#8B7355] transition-colors duration-300"
            >
              <div className="w-6 h-6 rounded-full bg-white/60 border border-[#8B7355]/15 flex items-center justify-center shrink-0">
                <Image
                  src="/watermark.png"
                  alt=""
                  width={22}
                  height={22}
                  className="w-[18px] h-[18px] object-contain brightness-110 saturate-125 animate-[soft-blink_3s_ease-in-out_infinite]"
                  style={{ filter: "drop-shadow(0 1px 1px rgba(0,38,62,0.2))" }}
                  unoptimized
                />
              </div>
              <span>{BRAND_NAME_CN}中国官网</span>
              <ExternalLink className="w-3 h-3 opacity-50 transition-transform duration-500 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </a>

            {/* 用户状态 - 桌面端 */}
            {user ? (
              <div className="hidden md:flex items-center gap-2">
                <Link
                  href="/workbench"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-100/80 hover:bg-slate-200/80 border border-slate-200/60 text-xs lg:text-[13px] font-medium tracking-[0.05em] text-slate-600 hover:text-slate-800 transition-colors duration-300"
                >
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>管理后台</span>
                </Link>
                <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-slate-50/80 border border-slate-100/60">
                  <span className="w-6 h-6 rounded-full bg-[var(--navbar-accent,#8B7355)]/10 flex items-center justify-center text-[11px] font-bold text-[var(--navbar-accent,#8B7355)] shrink-0">
                    {userInitial}
                  </span>
                  <span className="text-xs lg:text-[13px] font-medium text-slate-600 max-w-[80px] truncate">
                    {userDisplayName}
                  </span>
                </div>
              </div>
            ) : null}

            {/* 移动端汉堡菜单按钮 */}
            <button
              onClick={() => setMobileMenuOpen(true)}
              aria-label="打开菜单"
              aria-expanded={mobileMenuOpen}
              className="md:hidden flex items-center justify-center w-10 h-10 rounded-full hover:bg-slate-100/80 transition-colors text-slate-600 cursor-pointer"
            >
              <Menu className="w-5 h-5" />
            </button>
          </div>
        </div>
      </nav>

      {/* ========== 移动端全屏滑出菜单 ========== */}
      <div
        className={`fixed inset-0 z-[101] md:hidden transition-all duration-400 ${
          mobileMenuOpen ? "visible opacity-100" : "invisible opacity-0"
        }`}
      >
        {/* 半透明遮罩 */}
        <div
          className="absolute inset-0 bg-black/15 backdrop-blur-sm"
          onClick={() => setMobileMenuOpen(false)}
        />

        {/* 右侧滑出面板 */}
        <div
          role="dialog"
        aria-modal="true"
        aria-label="导航菜单"
        className={`absolute top-0 right-0 h-full w-[min(300px,85vw)] bg-white shadow-2xl transform transition-transform duration-500 ease-out ${
            mobileMenuOpen ? "translate-x-0" : "translate-x-full"
          }`}
        >
          <div className="flex flex-col h-full px-6 pt-6 pb-8">
            {/* 关闭按钮 */}
            <div className="flex justify-end mb-6">
              <button
                ref={closeButtonRef}
                onClick={() => setMobileMenuOpen(false)}
                aria-label="关闭菜单"
                className="flex items-center justify-center w-10 h-10 rounded-full hover:bg-slate-100 transition-colors text-slate-500 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* 用户信息 / 登录入口 */}
            <div className="mb-8 px-2">
              {user ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-full bg-[var(--navbar-accent,#8B7355)]/10 flex items-center justify-center text-lg font-bold text-[var(--navbar-accent,#8B7355)] shrink-0">
                      {userInitial}
                    </div>
                    <div className="min-w-0">
                      <p className="text-[15px] font-semibold text-slate-800 truncate">
                        {userDisplayName}
                      </p>
                      <p className="text-[13px] text-slate-400 mt-0.5">
                        {user.role === "SUPER_ADMIN" ? "超级管理员" : user.role === "AUDITOR" ? "审核员" : "已登录"}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Link
                      href="/workbench"
                      onClick={handleNavClick}
                      className="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-[var(--navbar-accent,#8B7355)]/8 text-[13px] font-medium text-[var(--navbar-accent,#8B7355)] hover:bg-[var(--navbar-accent,#8B7355)]/15 transition-colors"
                    >
                      <ShieldCheck className="w-4 h-4" />
                      管理后台
                    </Link>
                    <button
                      onClick={() => {
                        handleNavClick();
                        logout();
                      }}
                      className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-red-50 text-[13px] font-medium text-red-500 hover:bg-red-100 transition-colors cursor-pointer"
                    >
                      <LogOut className="w-4 h-4" />
                      退出
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-4 px-2">
                  <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-400">
                    <User className="w-6 h-6" />
                  </div>
                  <p className="text-[15px] text-[#13263D] font-medium">
                    授权核验平台
                  </p>
                </div>
              )}
            </div>

            {/* 分隔线 */}
            <div className="border-t border-slate-100 mb-4" />

            {/* 导航链接 */}
            <nav className="flex flex-col gap-1">
              {!isHome && (
                <Link
                  href="/"
                  onClick={handleNavClick}
                  className="flex items-center gap-3 px-4 py-3.5 text-[15px] font-medium tracking-[0.1em] text-slate-700 hover:text-slate-900 hover:bg-slate-50 rounded-xl transition-colors"
                >
                  首页
                </Link>
              )}
              <a
                href="https://nihplod.cn"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="前往旎柏中国官网（新窗口打开）"
                onClick={handleNavClick}
                className="group flex items-center gap-3 px-4 py-3.5 text-[15px] font-medium tracking-[0.1em] text-[#8B7355]/80 hover:text-[#8B7355] rounded-xl transition-colors duration-500"
                >
                <Image
                  src="/watermark.png"
                  alt=""
                  width={28}
                  height={28}
                  className="w-7 h-7 object-contain drop-shadow-[0_1px_2px_rgba(0,38,62,0.2)] brightness-110 saturate-125 animate-[soft-blink_3s_ease-in-out_infinite]"
                  unoptimized
                />
                {BRAND_NAME_CN}中国官网
                <ExternalLink className="w-3.5 h-3.5 opacity-50 ml-auto transition-transform duration-500 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              </a>
            </nav>

            {/* 底部品牌信息 */}
            <div className="mt-auto pt-8">
              <Image
                src="/NIHPLOD-logo.svg"
                alt="NIHPLOD"
                width={0}
                height={0}
                className="h-5 w-auto opacity-40 mx-auto"
                unoptimized
              />
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes soft-blink {
          0%, 100% { opacity: 0.88; }
          50% { opacity: 1; }
        }
      `}</style>
    </>
  );
}

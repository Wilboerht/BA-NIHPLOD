"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { Menu, ExternalLink, ShieldAlert, QrCode, ChevronDown, X } from "lucide-react";
import { BRAND_NAME_CN } from "@/lib/config";

export function WebsiteNavbar() {
  const pathname = usePathname();
  const router = useRouter();
  const [scrolled, setScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [wechatExpanded, setWechatExpanded] = useState(false);
  const touchStartX = useRef(0);
  const actionLockRef = useRef(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
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

    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileMenuOpen]);

  // 移动菜单：Escape 关闭、焦点锁定在面板内
  useEffect(() => {
    if (!mobileMenuOpen) return;

    const previousFocus = document.activeElement as HTMLElement | null;
    const focusTimer = window.setTimeout(() => closeButtonRef.current?.focus(), 60);

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setMobileMenuOpen(false);
        return;
      }
      if (event.key !== 'Tab' || !panelRef.current) return;

      const focusable = Array.from(
        panelRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      ).filter((element) => element.offsetParent !== null);

      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener('keydown', handleKeyDown);
      previousFocus?.focus?.();
    };
  }, [mobileMenuOpen]);

  // 防抖锁定：菜单过渡动画 400ms + 余量，期间屏蔽重复操作
  const withLock = useCallback((fn: () => void) => {
    if (actionLockRef.current) return;
    actionLockRef.current = true;
    fn();
    setTimeout(() => { actionLockRef.current = false; }, 420);
  }, []);

  const openMenu = useCallback(() => {
    withLock(() => setMobileMenuOpen(true));
  }, [withLock]);

  const closeMenu = useCallback(() => {
    // 关闭不参与 420ms 打开防抖：打开后立即关闭必须生效
    setMobileMenuOpen(false);
  }, []);

  const handleMenuAction = useCallback((eventName: string, action: "scan" | "report") => {
    withLock(() => {
      setMobileMenuOpen(false);
      if (pathname === "/") {
        window.dispatchEvent(new CustomEvent(eventName));
      } else {
        // 非首页没有弹窗监听器，跳回首页并自动打开对应弹窗
        router.push(`/?action=${action}`);
      }
    });
  }, [pathname, router, withLock]);

  return (
    <>
      {/* ========== 桌面端 + 移动端导航栏 ========== */}
      <nav
        aria-label="主导航"
        className={`fixed top-0 left-0 right-0 z-[100] grid h-[var(--site-header-h)] place-items-center px-6 md:px-8 lg:px-12 transition-[background-color,border-color,box-shadow] duration-500 ${
          scrolled
            ? "bg-[#F6F4F0]/80 backdrop-blur-md border-b border-[#8B7355]/10"
            : "bg-[#F6F4F0] border-b border-transparent"
        }`}
      >
        <div className="relative flex w-full items-center justify-center gap-4 md:justify-between">
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
              loading="eager"
              unoptimized
            />
            <div className="hidden sm:block w-px h-4 md:h-5 bg-slate-300/60" />
            <span className="hidden sm:inline text-[13px] md:text-[15px] font-medium tracking-[0.2em] uppercase text-[#13263D] leading-none">
              授权核验平台
            </span>
          </Link>

          {/* 右侧操作区：PC 端可见 */}
          <div className="hidden md:flex items-center gap-1 lg:gap-2">
            {/* 旎柏中国官网 - 桌面端 */}
            <a
              href="https://nihplod.cn"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="前往旎柏中国官网（新窗口打开）"
              className="group ml-1 hidden md:flex items-center gap-2 px-3.5 py-2 rounded-full bg-[#8B7355]/5 hover:bg-[#8B7355]/10 border border-[#8B7355]/10 text-sm font-medium tracking-[0.1em] text-[#6B5346] hover:text-[#4E3F2A] transition-colors duration-300"
            >
              <div className="w-6 h-6 rounded-full bg-white/60 border border-[#8B7355]/15 flex items-center justify-center shrink-0">
                <Image
                  src="/watermark.png"
                  alt=""
                  width={22}
                  height={22}
                  className="w-[18px] h-[18px] object-contain brightness-110 saturate-125 animate-[soft-blink_3s_ease-in-out_infinite] motion-reduce:animate-none"
                  style={{ filter: "drop-shadow(0 1px 1px rgba(0,38,62,0.2))" }}
                  unoptimized
                />
              </div>
              <span>{BRAND_NAME_CN}中国官网</span>
              <ExternalLink className="w-3 h-3 opacity-50 transition-transform duration-500 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </a>
          </div>

          {/* 移动端汉堡菜单按钮：绝对定位右侧 */}
          <button
            onClick={openMenu}
            aria-label="打开菜单"
            aria-expanded={mobileMenuOpen}
            aria-controls="mobile-site-menu"
            className="md:hidden absolute left-0 flex items-center justify-center w-10 h-10 rounded-full hover:bg-slate-100/80 transition-colors text-slate-600 cursor-pointer"
          >
            <Menu className="w-5 h-5" />
          </button>
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
          onClick={closeMenu}
        />

        {/* 左侧滑出面板 */}
        <div
          ref={panelRef}
          id="mobile-site-menu"
          role="dialog"
          aria-modal="true"
          aria-label="导航菜单"
          onTouchStart={(e) => { touchStartX.current = e.touches[0].clientX; }}
          onTouchEnd={(e) => {
            if (touchStartX.current - e.changedTouches[0].clientX > 60) {
              closeMenu();
            }
          }}
          className={`absolute top-0 left-0 h-full w-[min(300px,85vw)] bg-white shadow-2xl rounded-r-2xl transform transition-transform duration-500 ease-out ${
            mobileMenuOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <button
            ref={closeButtonRef}
            type="button"
            onClick={closeMenu}
            aria-label="关闭菜单"
            className="absolute right-4 top-4 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-slate-50 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-4 w-4" />
          </button>
          <div className="flex flex-col h-full px-6 py-6 pt-16">
            {/* 品牌标识 */}
            <div className="my-3">
              <div className="flex items-center justify-center gap-3">
                <Image
                  src="/NIHPLOD-logo.svg"
                  alt="NIHPLOD"
                  width={0}
                  height={0}
                  className="h-7 w-auto"
                  unoptimized
                />
                <div className="w-px h-4 bg-slate-300/60" />
                <span className="text-[14px] font-medium tracking-[0.2em] uppercase text-[#13263D]">
                  授权核验平台
                </span>
              </div>
            </div>

            {/* 菜单项 */}
            <nav className="flex flex-col gap-1 mt-auto pb-6">
              <button
                onClick={() => handleMenuAction('open-scanner-modal', 'scan')}
                className="flex items-center gap-3 px-4 py-3.5 text-[15px] font-medium tracking-[0.1em] text-slate-600 hover:text-slate-900 hover:bg-slate-50 rounded-xl transition-colors cursor-pointer"
              >
                <QrCode className="w-4 h-4" />
                扫码核验
              </button>

              <button
                onClick={() => handleMenuAction('open-report-modal', 'report')}
                className="flex items-center gap-3 px-4 py-3.5 text-[15px] font-medium tracking-[0.1em] text-slate-600 hover:text-slate-900 hover:bg-slate-50 rounded-xl transition-colors cursor-pointer"
              >
                <ShieldAlert className="w-4 h-4" />
                维权申诉
              </button>

              <div className="border-t border-slate-100 my-2" />

              <a
                href="https://nihplod.cn/privacy"
                target="_blank"
                rel="noopener noreferrer"
                onClick={closeMenu}
                className="flex items-center gap-3 px-4 py-3.5 text-[15px] font-medium tracking-[0.1em] text-slate-600 hover:text-slate-900 hover:bg-slate-50 rounded-xl transition-colors"
              >
                隐私声明
                <ExternalLink className="w-3.5 h-3.5 opacity-40 ml-auto" />
              </a>

              <a
                href="https://nihplod.cn"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="前往旎柏中国官网（新窗口打开）"
                onClick={closeMenu}
                className="group flex items-center gap-3 px-4 py-3.5 text-[15px] font-medium tracking-[0.1em] text-slate-600 hover:text-slate-900 hover:bg-slate-50 rounded-xl transition-colors"
                >
                {BRAND_NAME_CN}中国官网
                <ExternalLink className="w-3.5 h-3.5 opacity-50 ml-auto transition-transform duration-500 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              </a>

              {/* 社交媒体 */}
              <a
                href="https://www.xiaohongshu.com/user/profile/62c3a397000000001b026d43"
                target="_blank"
                rel="noopener noreferrer"
                onClick={closeMenu}
                aria-label="前往小红书"
                className="flex items-center gap-3 px-4 py-3.5 text-[15px] font-medium tracking-[0.1em] text-slate-600 hover:text-slate-900 hover:bg-slate-50 rounded-xl transition-colors"
              >
                小红书
                <ExternalLink className="w-3.5 h-3.5 opacity-40 ml-auto" />
              </a>
              <button
                onClick={() => setWechatExpanded(!wechatExpanded)}
                aria-label="查看公众号二维码"
                className="flex items-center gap-3 px-4 py-3.5 text-[15px] font-medium tracking-[0.1em] text-slate-600 hover:text-slate-900 hover:bg-slate-50 rounded-xl transition-colors cursor-pointer"
              >
                微信服务号
                <ChevronDown className={`w-4 h-4 ml-auto transition-transform duration-300 ${wechatExpanded ? 'rotate-180' : ''}`} />
              </button>
              <div className={`overflow-hidden transition-all duration-300 ease-out ${wechatExpanded ? 'max-h-60 opacity-100' : 'max-h-0 opacity-0'}`}>
                <div className="px-4 pb-4 pt-1 text-center">
                  <Image
                    src="/assets/wechat-qr.jpg"
                    alt="微信公众号二维码"
                    width={160}
                    height={160}
                    className="w-40 h-40 mx-auto rounded-xl border border-slate-100"
                    unoptimized
                  />
                </div>
              </div>

              {/* 底部装饰 */}
              <div className="flex justify-center pt-6">
                <Image
                  src="/watermark.png"
                  alt=""
                  width={36}
                  height={36}
                  className="w-9 h-9 object-contain opacity-30 animate-[soft-blink_3s_ease-in-out_infinite] motion-reduce:animate-none"
                  unoptimized
                />
              </div>
            </nav>
          </div>
        </div>
      </div>

    </>
  );
}

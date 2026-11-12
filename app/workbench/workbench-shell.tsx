"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

import Sidebar from "@/components/Sidebar/Sidebar";
import { WorkbenchAuthProvider } from "@/components/auth/WorkbenchAuthContext";
import styles from "./layout.module.css";
import { ADMIN_ROLES, type UserSession } from "@/types";
import { fetchWithTimeout } from "@/lib/fetch";

const PAGE_TITLES: Record<string, string> = {
  '/workbench': '工作台首页',
  '/workbench/certificates': '授权核发中心',
  '/workbench/complaints': '打假投诉审核',
  '/workbench/users': '管理员管理',
  '/workbench/audit-logs': '系统操作日志',
};

function getPageTitle(pathname: string): string {
  if (PAGE_TITLES[pathname]) {
    return `${PAGE_TITLES[pathname]} · NIHPLOD 管理后台`;
  }
  for (const [path, title] of Object.entries(PAGE_TITLES)) {
    if (pathname.startsWith(path + '/')) {
      return `${title} · NIHPLOD 管理后台`;
    }
  }
  return 'NIHPLOD 管理后台';
}

export default function WorkbenchShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [user, setUser] = useState<UserSession | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    document.title = getPageTitle(pathname);
    const handleResize = () => {
      if (window.innerWidth < 1024) {
        setIsCollapsed(true);
      }
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [pathname]);

  useEffect(() => {
    let cancelled = false;

    const loadUser = async () => {
      try {
        const res = await fetchWithTimeout('/api/auth/me', { cache: 'no-store' });
        const data = await res.json().catch(() => null);
        if (res.ok && data?.user && ADMIN_ROLES.includes(data.user.role)) {
          if (data.user.is_first_login) {
            window.location.href = '/reset-password';
            return;
          }
          if (!cancelled) setUser(data.user);
          return;
        }
        if (!cancelled) setAuthError('身份验证失败，请重新登录');
      } catch (e) {
        console.error('Auth verification error:', e);
        if (!cancelled) setAuthError('网络异常，请刷新页面重试');
      }
    };

    loadUser();
    return () => {
      cancelled = true;
    };
  }, []);

  if (authError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <p className="text-red-600 mb-4">{authError}</p>
          <a href="/admin/login" className="text-sm text-blue-600 hover:underline">
            返回登录页
          </a>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="w-6 h-6 border-2 border-[#121212]/20 border-t-[#121212] rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <WorkbenchAuthProvider user={user}>
      <div className={styles.container}>
        <Sidebar isCollapsed={isCollapsed} onToggle={() => setIsCollapsed(!isCollapsed)} />
        <main
          className={styles.main}
          style={{ paddingLeft: isCollapsed ? "68px" : "256px" }}
        >
          {children}
          <footer className="w-full text-center py-5 text-slate-400 text-xs shrink-0 border-t border-slate-100 bg-white/50 backdrop-blur-sm flex flex-col gap-1">
            <span className="text-xs" suppressHydrationWarning>&copy; {new Date().getFullYear()} NIHPLOD. All rights reserved.</span>
            <div className="flex items-center justify-center gap-2">
              <a
                href="https://beian.miit.gov.cn/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs hover:text-slate-500 transition-colors"
              >
                沪ICP备2026014764号-1
              </a>
              <span className="text-xs text-slate-300">|</span>
              <a
                href="http://www.beian.gov.cn/portal/registerSystemInfo"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 text-xs hover:text-slate-500 transition-colors"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/assets/beian.webp" alt="公安网备" className="w-3 h-3" />
                沪公网安备31010702010178号
              </a>
            </div>
          </footer>
        </main>
      </div>
    </WorkbenchAuthProvider>
  );
}

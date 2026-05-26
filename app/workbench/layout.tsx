"use client";

import { useEffect, useState } from "react";

import Sidebar from "@/components/Sidebar/Sidebar";
import styles from "./layout.module.css";
import { ADMIN_ROLES, type UserSession } from "@/types";

export default function WorkbenchLayout({ children }: { children: React.ReactNode }) {
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [user, setUser] = useState<UserSession | null>(null);
  const [userType, setUserType] = useState<'admin' | 'dealer' | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  
  // 移动端自动收起侧边栏
  useEffect(() => {
    document.title = "NIHPLOD 品牌授权管理平台";
    const handleResize = () => {
      if (window.innerWidth < 1024) {
        setIsCollapsed(true);
      }
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    const loadUser = async () => {
      try {
        const res = await fetch('/api/auth/me', { cache: 'no-store' });
        if (res.ok) {
          const data = await res.json();
          if (data.user && ADMIN_ROLES.includes(data.user.role)) {
            setUser(data.user);
            setUserType('admin');
            setIsAuthorized(true);
            return;
          }
        }
        // 如果走到这里，说明中间件放行但 /api/auth/me 拒绝了（极少见）
        setAuthError('身份验证失败，请重新登录');
      } catch (e) {
        console.error('Auth verification error:', e);
        setAuthError('网络异常，请刷新页面重试');
      }
    };

    loadUser();
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

  if (!isAuthorized) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="w-6 h-6 border-2 border-[#121212]/20 border-t-[#121212] rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <Sidebar isCollapsed={isCollapsed} onToggle={() => setIsCollapsed(!isCollapsed)} />
      <main 
        className={styles.main}
        style={{ paddingLeft: isCollapsed ? "80px" : "256px" }}
      >
        {children}
        <footer className="w-full text-center py-5 text-slate-400 text-xs shrink-0 border-t border-slate-100 bg-white/50 backdrop-blur-sm flex flex-col gap-1">
          <span className="text-xs">&copy; {new Date().getFullYear()} NIHPLOD. All rights reserved.</span>
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
              className="flex items-center justify-center gap-1 text-xs hover:text-slate-500 transition-colors"
            >
              <img src="/assets/beian.webp" alt="公安网备" className="w-3 h-3" />
              沪公网安备31010702010178号
            </a>
          </div>
        </footer>
      </main>
    </div>
  );
}

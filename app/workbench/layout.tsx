"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import Sidebar from "@/components/Sidebar/Sidebar";
import styles from "./layout.module.css";

interface UserSession {
  id: string;
  phone?: string;
  username?: string;
  full_name?: string;
  role?: string;
  is_first_login?: boolean;
}

export default function WorkbenchLayout({ children }: { children: React.ReactNode }) {
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [user, setUser] = useState<UserSession | null>(null);
  const [userType, setUserType] = useState<'admin' | 'dealer' | null>(null);
  const router = useRouter();
  
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
    const checkAuth = async () => {
      // 1. 首先检查 sessionStorage 里的用户信息
      const sessionUserStr = sessionStorage.getItem('user');
      if (sessionUserStr) {
        try {
          const sessionUser = JSON.parse(sessionUserStr);
          
          // 经销商用户不允许进入 workbench
          if (sessionUser.role === 'DEALER') {
            router.replace("/dealer");
            return;
          }
          
          // 管理员用户（从 sessionStorage）可以进入
          if (sessionUser.role === 'SUPER_ADMIN' || sessionUser.role === 'AUDITOR' || sessionUser.role === 'MANAGER' || sessionUser.role === 'PROJECT_MANAGER') {
            setUser(sessionUser);
            setUserType('admin');
            setIsAuthorized(true);
            return;
          }
        } catch (e) {
          console.error('Failed to parse user session:', e);
        }
      }

      // sessionStorage 中没有用户，重定向到首页
      router.replace("/");
    };

    checkAuth();
  }, [router]);

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
              公网安备xxxxxxxxx号
            </a>
          </div>
        </footer>
      </main>
    </div>
  );
}

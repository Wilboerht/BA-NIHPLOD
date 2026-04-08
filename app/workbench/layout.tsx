"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
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

  useEffect(() => {
    const checkAuth = async () => {
      // 1. 首先检查 sessionStorage 里是否有经销商用户，如果有则拦截不允许进入 workbench
      const sessionUserStr = sessionStorage.getItem('user');
      if (sessionUserStr) {
        try {
          const sessionUser = JSON.parse(sessionUserStr);
          // 经销商用户不允许进入 workbench，重定向到 /dealer
          router.replace("/dealer");
          return;
        } catch (e) {
          console.error('Failed to parse user session:', e);
        }
      }

      // 2. 检查 Supabase auth（管理员用户）
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        router.replace("/");
        return;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", session.user.id)
        .single();
        
      if (!profile) {
        router.replace("/");
        return;
      }

      setUser(profile as UserSession);
      setUserType('admin');
      
      if (profile.is_first_login) {
        router.replace("/reset-password");
        return;
      }
      
      setIsAuthorized(true);
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
        <footer className="w-full text-center py-5 text-slate-400 text-xs shrink-0 border-t border-slate-100 bg-white/50 backdrop-blur-sm">
          &copy; {new Date().getFullYear()} NIHPLOD. All rights reserved.
        </footer>
      </main>
    </div>
  );
}

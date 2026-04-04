"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { supabase } from "@/lib/supabase";
import styles from "./Sidebar.module.css";
import { Home, ShieldCheck, Megaphone, PanelLeftClose, PanelLeftOpen, LogOut, Building2, UserCog } from "lucide-react";

export default function Sidebar({
  isCollapsed,
  onToggle
}: {
  isCollapsed: boolean;
  onToggle: () => void;
}) {
  const pathname = usePathname();
  const [userName, setUserName] = useState("User");
  const [userEmail, setUserEmail] = useState("admin@nihplod.co");
  const [userRole, setUserRole] = useState<string | null>(null);

  const [isConfirmingLogout, setIsConfirmingLogout] = useState(false);

  useEffect(() => {
    // 监听 Auth 状态变化（包括初始加载、登录、登出）
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log("🛡️ Auth State Change:", event, session?.user?.email);
      
      if (session?.user?.email) {
        setUserEmail(session.user.email);
        setUserName(session.user.email.split("@")[0]);

        // 获取角色
        const { data: profile, error } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', session.user.id)
          .single();
        
        if (error) {
          console.error("❌ Failed to fetch user role:", error.message);
          setUserRole(null);
        } else {
          console.log("✅ Success! Identified user role:", profile?.role);
          setUserRole(profile?.role);
        }
      } else {
        setUserRole(null);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const handleLogout = async () => {
    if (isConfirmingLogout) {
      await supabase.auth.signOut();
      window.location.href = "/";
    } else {
      setIsConfirmingLogout(true);
      setTimeout(() => setIsConfirmingLogout(false), 3000);
    }
  };

  const userInitial = userName.charAt(0).toUpperCase();

  return (
    <nav className={`${styles.sidebar} ${isCollapsed ? styles.collapsed : ""}`}>
      <header className={styles.header}>
        <div className={styles.logoGroup}>
          <img src="/NIHPLOD-logo.svg" alt="NIHPLOD Logo" className={styles.logo} />
          {!isCollapsed && (
            <span className={styles.platformName}>品牌授权管理后台</span>
          )}
        </div>
      </header>

      <div className={styles.menuGroups}>
        <div className={styles.group}>
          {!isCollapsed && <div className={styles.groupLabel}>概览</div>}
          <Link href="/workbench" className={`${styles.menuLink} ${pathname === "/workbench" ? styles.active : ""}`}>
            <span className={styles.icon}><Home size={17} /></span>
            {!isCollapsed && "工作台首页"}
          </Link>
        </div>

        <div className={styles.group}>
          {!isCollapsed && <div className={styles.groupLabel}>管理中台</div>}
          <Link href="/workbench/certificates" className={`${styles.menuLink} ${pathname.startsWith("/workbench/certificates") ? styles.active : ""}`}>
            <span className={styles.icon}><ShieldCheck size={17} /></span>
            {!isCollapsed && "授权核发中心"}
          </Link>
          <Link href="/workbench/complaints" className={`${styles.menuLink} ${pathname.startsWith("/workbench/complaints") ? styles.active : ""}`}>
            <span className={styles.icon}><Megaphone size={17} /></span>
            {!isCollapsed && "打假投诉审核"}
          </Link>
          {(userRole === 'SUPER_ADMIN' || userRole === 'AUDITOR') && (
            <Link href="/workbench/dealers" className={`${styles.menuLink} ${pathname === "/workbench/dealers" ? styles.active : ""}`}>
              <span className={styles.icon}><Building2 size={17} /></span>
              {!isCollapsed && "经销商管理"}
            </Link>
          )}
        </div>

        {userRole === 'SUPER_ADMIN' && (
          <div className={styles.group}>
            {!isCollapsed && <div className={styles.groupLabel}>权限与系统管理</div>}
            <Link href="/workbench/users" className={`${styles.menuLink} ${pathname === "/workbench/users" ? styles.active : ""}`}>
              <span className={styles.icon}><UserCog size={17} /></span>
              {!isCollapsed && "管理员管理"}
            </Link>
          </div>
        )}
      </div>

      <footer className={styles.footer}>
        <button className={styles.toggleBtn} onClick={onToggle}>
          {isCollapsed ? <PanelLeftOpen size={18} /> : (
            <div className={styles.toggleInner}>
              <PanelLeftClose size={17} />
              <span>收起侧边栏</span>
            </div>
          )}
        </button>

        <div className={styles.userProfile} onClick={() => { }} style={{ cursor: 'pointer' }}>
          <div className={styles.userAvatar}>
            {userInitial}
          </div>
          {!isCollapsed && (
            <div className={styles.userInfo}>
              <div className={styles.userName}>{userName}</div>
              <div className={styles.userEmail}>{userEmail}</div>
            </div>
          )}
          {!isCollapsed && (
            <div
              className={styles.settingsBtn}
              onClick={(e) => { e.stopPropagation(); handleLogout(); }}
              style={{ padding: isConfirmingLogout ? '4px 10px' : '' }}
            >
              {isConfirmingLogout ? (
                <span className="text-[10px] font-bold text-[#eb5757]">再按退出</span>
              ) : (
                <LogOut size={16} className={styles.settingsIcon} />
              )}
            </div>
          )}
        </div>
      </footer>
    </nav>
  );
}

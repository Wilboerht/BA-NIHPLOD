"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "./Sidebar.module.css";
import { motion, AnimatePresence } from "framer-motion";
import { Home, ShieldCheck, Megaphone, PanelLeftClose, PanelLeftOpen, LogOut, Building2, UserCog, Globe, LogOut as LogOutIcon, AlertCircle } from "lucide-react";

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

  const [showLogoutModal, setShowLogoutModal] = useState(false);

  useEffect(() => {
    // 从 sessionStorage 获取当前登录用户信息
    const userStr = sessionStorage.getItem('user');
    if (userStr) {
      try {
        const user = JSON.parse(userStr);
        setUserName(user.full_name || user.username || "User");
        setUserEmail(user.username || user.phone || "admin@nihplod.cn");
        setUserRole(user.role);
        console.log("✅ User info loaded from sessionStorage:", user);
      } catch (e) {
        console.error("❌ Failed to parse user session:", e);
      }
    }
  }, []);

  const handleLogout = async () => {
    sessionStorage.removeItem('user');
    window.location.href = "/";
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
        <a href="/" target="_blank" rel="noopener noreferrer" className={styles.menuLink}>
          <span className={styles.icon}><Globe size={17} /></span>
          {!isCollapsed && "前往核验大厅"}
        </a>
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
              onClick={(e) => { e.stopPropagation(); setShowLogoutModal(true); }}
            >
              <LogOut size={16} className={styles.settingsIcon} />
            </div>
          )}
        </div>
      </footer>

      <AnimatePresence>
        {showLogoutModal && (
          <div className="fixed inset-0 z-[999] flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowLogoutModal(false)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-md"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="relative w-full max-w-[340px] bg-white rounded-[24px] p-8 shadow-2xl flex flex-col items-center text-center"
            >
              <div className="w-14 h-14 rounded-full bg-rose-50 flex items-center justify-center text-rose-500 mb-5 text-[24px]">
                <AlertCircle size={28} />
              </div>
              <h3 className="text-base font-bold text-slate-900 tracking-wider mb-2">确认退出登录？</h3>
              <p className="text-[13px] text-slate-400 font-medium leading-relaxed mb-8">
                退出后您将需要重新验证身份<br />才能访问管理后台。
              </p>
              
              <div className="flex flex-col w-full gap-3">
                <button 
                  onClick={handleLogout}
                  className="w-full py-3.5 bg-rose-500 hover:bg-rose-600 text-white rounded-xl text-[13px] font-bold tracking-widest transition-all active:scale-[0.98]"
                >
                  确认退出
                </button>
                <button 
                  onClick={() => setShowLogoutModal(false)}
                  className="w-full py-3.5 bg-slate-50 hover:bg-slate-100 text-slate-400 hover:text-slate-600 rounded-xl text-[13px] font-bold tracking-widest transition-all"
                >
                  取消
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </nav>
  );
}

"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";

import Sidebar from "@/components/Sidebar/Sidebar";
import styles from "./layout.module.css";

export default function WorkbenchLayout({ children }: { children: React.ReactNode }) {
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        router.replace("/login");
        return;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("is_first_login")
        .eq("id", session.user.id)
        .single();
        
      if (profile?.is_first_login) {
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

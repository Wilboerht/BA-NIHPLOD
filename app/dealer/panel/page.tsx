"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import DealerListPanel from "@/components/DealerListPanel";

interface UserSession {
  id: string;
  phone?: string;
  username?: string;
  full_name?: string;
  role?: string;
}

export default function DealerPanelPage() {
  const router = useRouter();
  const [user, setUser] = useState<UserSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    document.title = "NIHPLOD 品牌授权管理平台";
    
    const checkAuth = async () => {
      try {
        const res = await fetch('/api/auth/me');
        if (!res.ok) {
          router.push("/");
          return;
        }
        const data = await res.json();
        const userData = data.user as UserSession;
        
        // 确保只有 DEALER 角色可以访问
        if (userData?.role !== "DEALER") {
          router.push("/");
          return;
        }

        setUser(userData);
      } catch (e) {
        console.error("Failed to fetch user:", e);
        router.push("/");
      } finally {
        setIsLoading(false);
      }
    };
    
    checkAuth();
  }, [router]);

  if (isLoading) {
    return (
      <div className="w-full h-screen flex items-center justify-center bg-white">
        <div className="text-center space-y-3">
          <div className="w-3 h-3 rounded-full bg-blue-500 animate-pulse mx-auto" />
          <p className="text-slate-600 text-sm font-medium">加载中...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch (e) {
      console.error('Logout error:', e);
    }
    router.push("/");
  };

  return (
    <main className="w-full min-h-screen bg-slate-50">
      <div className="max-w-6xl mx-auto h-screen flex flex-col">
        <DealerListPanel isVisible={true} onLogout={handleLogout} />
      </div>
    </main>
  );
}

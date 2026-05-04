"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Lock, Eye, EyeOff, ArrowRight, AlertTriangle } from "lucide-react";
import Link from "next/link";

export default function AdminLoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isChecking, setIsChecking] = useState(true);

  // 页面加载时检查是否已登录
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const res = await fetch('/api/auth/me');
        if (res.ok) {
          const data = await res.json();
          const user = data.user;
          if (user?.role === 'SUPER_ADMIN' || user?.role === 'AUDITOR' || user?.role === 'MANAGER' || user?.role === 'PROJECT_MANAGER') {
            window.location.href = '/workbench';
            return;
          }
          // 经销商不允许访问管理员登录页
          if (user?.role === 'DEALER') {
            window.location.href = '/';
            return;
          }
        }
      } catch (e) {
        console.error('Auth check error:', e);
      }
      setIsChecking(false);
    };
    checkAuth();
  }, []);

  // 错误自动清除
  useEffect(() => {
    if (!error) return;
    const timer = setTimeout(() => setError(null), 3000);
    return () => clearTimeout(timer);
  }, [error]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      setError("请输入账号和密码");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: username, password, loginType: 'admin' })
      });

      const data = await response.json();
      if (!response.ok) {
        setError(data.error || "登录失败");
        setIsLoading(false);
        return;
      }

      // 根据首次登录状态处理
      if (data.user.is_first_login) {
        window.location.href = '/reset-password';
      } else {
        window.location.href = '/workbench';
      }
    } catch (err) {
      console.error(err);
      setError("系统验证出错，请稍后再试。");
      setIsLoading(false);
    }
  };

  if (isChecking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FAFAFA]">
        <div className="w-6 h-6 border-2 border-[#8B7355]/20 border-t-[#8B7355] rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-[#FAFAFA] relative overflow-hidden font-sans">
      {/* 背景装饰 */}
      <div className="absolute inset-0 pointer-events-none opacity-[0.03] z-0"
           style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E\")" }} />
      
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: "spring", damping: 25, stiffness: 300 }}
        className="relative w-full max-w-[420px] mx-4"
      >
        {/* 错误提示 */}
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="mb-4 bg-white text-slate-800 px-5 py-3 rounded-full shadow-lg border border-slate-100 flex items-center gap-3 text-xs font-bold tracking-widest"
          >
            <div className="w-6 h-6 rounded-full bg-red-50 flex items-center justify-center shrink-0">
              <AlertTriangle className="w-[14px] h-[14px] text-red-500" />
            </div>
            {error}
          </motion.div>
        )}

        <div className="bg-white rounded-[28px] shadow-[0_45px_80px_-16px_rgba(0,0,0,0.15)] overflow-hidden">
          <div className="p-10 pt-14 text-center pb-10">
            <Link href="/">
              <img src="/NIHPLOD-logo.svg" alt="NIHPLOD" className="h-[34px] mx-auto mb-7 cursor-pointer" />
            </Link>
            <h2 className="text-xl font-bold text-slate-900 tracking-[0.14em]">管理员登录</h2>
            <p className="text-sm text-slate-400 mt-3 tracking-wide">品牌授权管理后台</p>
          </div>

          <form onSubmit={handleLogin} className="px-10 pb-10 pt-2 flex flex-col gap-6">
            <div className="flex flex-col gap-2">
              <input
                type="text"
                required
                placeholder="请输入电子邮箱"
                className="block w-full bg-slate-50 border border-slate-100 rounded-xl py-3.5 px-5 text-[13px] text-slate-900 outline-none transition-all duration-300 focus:bg-white focus:border-[#C6A87C]/40 focus:ring-4 focus:ring-[#C6A87C]/15 placeholder:text-slate-300"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </div>

            <div className="flex flex-col gap-2">
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  placeholder="请输入密码"
                  className="block w-full bg-slate-50 border border-slate-100 rounded-xl py-3.5 px-5 text-[13px] text-slate-900 outline-none transition-all duration-300 focus:bg-white focus:border-[#C6A87C]/40 focus:ring-4 focus:ring-[#C6A87C]/15 placeholder:text-slate-300"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-[#8B7355]/10 text-[#8B7355] border border-[#8B7355]/40 rounded-xl py-3.5 font-bold tracking-widest text-[13px] hover:bg-[#8B7355]/20 hover:border-[#8B7355]/70 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300 flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin"></div>
              ) : (
                <>
                  登录 <ArrowRight size={16} />
                </>
              )}
            </button>
          </form>
        </div>

        <div className="text-center mt-6">
          <Link href="/" className="text-xs text-slate-400 hover:text-[#8B7355] transition-colors tracking-widest">
            ← 返回核验大厅
          </Link>
        </div>
      </motion.div>
    </div>
  );
}

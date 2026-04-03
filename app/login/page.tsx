"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Lock, User, Eye, EyeOff, ShieldCheck, ArrowRight } from "lucide-react";
import Link from "next/link";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    setTimeout(() => {
      if (email === "admin@brand.com" && password === "123456") {
        window.location.href = "/reset-password";
      } else {
        setError("登录凭据验证失败，请核对后重试。");
      }
      setIsLoading(false);
    }, 1200);
  };

  return (
    <main className="min-h-screen w-full flex items-center justify-center relative overflow-hidden selection:bg-slate-200"
          style={{ background: "radial-gradient(circle at center, #fffdfa 0%, #f7efe6 100%)" }}>
      
      {/* 极细微的光斑装饰 */}
      <div className="absolute top-0 left-0 w-full h-full opacity-30 pointer-events-none" 
           style={{ background: "radial-gradient(circle at 10% 10%, rgba(194, 65, 12, 0.03) 0%, transparent 40%)" }} />

      <motion.div 
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        className="relative z-10 w-full max-w-[460px] px-8 flex flex-col gap-10 items-center"
      >
        <header className="flex flex-col items-center gap-4">
          <div className="flex items-center gap-4">
             <div className="w-auto h-11 flex items-center justify-center">
               <img src="/NIHPLOD-logo.svg" alt="NIHPLOD" className="h-10 w-auto" />
             </div>
             <div className="w-px h-6 bg-slate-300/60" />
             <h1 className="text-2xl font-bold text-[#0f253e] tracking-tight">授权核发系统</h1>
          </div>
        </header>

        {/* 核心登录卡片 - 深度优化 */}
        <div className="w-full relative">
          {/* 背景光晕 */}
          <div className="absolute -inset-0.5 bg-gradient-to-b from-white/80 to-white/20 rounded-[24px] blur-sm opacity-50" />
          
          <form 
            onSubmit={handleLogin}
            className="relative w-full flex flex-col gap-5 bg-white/60 backdrop-blur-xl p-10 rounded-[22px] border border-white/80 shadow-[0_32px_64px_-16px_rgba(0,0,0,0.06)]"
          >
            {/* 账号字段 */}
            <div className="flex flex-col gap-2">
              <label className="text-[12px] font-bold text-slate-500 ml-1 uppercase tracking-wider">登录账号 / 邮箱</label>
              <input 
                type="email" 
                required 
                placeholder="请输入您的电子邮箱地址"
                className="block w-full bg-slate-50 border border-slate-200/60 rounded-xl py-4 px-5 text-sm text-slate-900 outline-none transition-all duration-300 focus:bg-white focus:border-slate-300 focus:ring-2 focus:ring-slate-900/5 placeholder:text-slate-200"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            {/* 密码字段 */}
            <div className="flex flex-col gap-2">
              <div className="flex justify-between items-center ml-1">
                <label className="text-[12px] font-bold text-slate-500 uppercase tracking-wider">安全密码</label>
                <Link href="#" className="text-[12px] font-medium text-slate-400 hover:text-slate-900 transition-colors">忘记密码</Link>
              </div>
              <div className="relative">
                <input 
                  type={showPassword ? "text" : "password"} 
                  required 
                  placeholder="请输入您的系统密码"
                  className="block w-full bg-slate-50 border border-slate-200/60 rounded-xl py-4 px-5 text-sm text-slate-900 outline-none transition-all duration-300 focus:bg-white focus:border-slate-300 focus:ring-2 focus:ring-slate-900/5 placeholder:text-slate-200 font-mono"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button 
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-900 transition-colors"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* 错误提示 - 动态出现 */}
            <AnimatePresence>
              {error && (
                <motion.p 
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  className="text-red-500 text-[12px] font-bold text-left ml-1 px-3 py-2 bg-red-50 rounded-lg border border-red-100"
                >
                  {error}
                </motion.p>
              )}
            </AnimatePresence>

            {/* 提交按钮 - 精简瘦身版 */}
            <button 
              type="submit" 
              disabled={isLoading}
              className="w-full h-11 mt-4 bg-slate-900 text-white rounded-xl text-[13px] font-bold flex items-center justify-center gap-2 hover:bg-slate-800 active:scale-[0.98] transition-all disabled:opacity-50 shadow-sm"
            >
              {isLoading ? (
                <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  立即进入
                  <ArrowRight className="w-4 h-4 ml-1" />
                </>
              )}
            </button>
          </form>
        </div>

        {/* 底注 - 品牌感 */}
        <footer className="text-center space-y-4">
          <Link href="/" className="text-slate-400 hover:text-slate-900 text-[11px] font-bold uppercase tracking-widest transition-colors flex items-center justify-center gap-2">
             &larr; 返回前台核验中心
          </Link>
          <div className="h-px w-8 bg-slate-200 mx-auto" />
          <p className="text-xs font-medium text-slate-400">© 2026 NIHPLOD · All rights reserved</p>
        </footer>
      </motion.div>
    </main>
  );
}

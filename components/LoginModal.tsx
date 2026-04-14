"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Lock, Eye, EyeOff, ArrowRight, X, AlertTriangle } from "lucide-react";

export default function LoginModal({ 
  isOpen, 
  onClose,
  onShowResetPassword 
}: { 
  isOpen: boolean; 
  onClose: () => void;
  onShowResetPassword?: () => void;
}) {
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loginType, setLoginType] = useState<'dealer' | 'admin'>('admin');

  // 当产生错误时，开启独立生命周期的 3 秒自动回收机制
  useEffect(() => {
    if (!error) return;
    const timer = setTimeout(() => setError(null), 3000);
    return () => clearTimeout(timer);
  }, [error]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    
    try {
      if (loginType === 'dealer') {
        // 经销商登录：用自定义认证
        const response = await fetch("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phone, password, loginType: 'dealer' })
        });

        const data = await response.json();
        if (!response.ok) {
          setError(data.error || "登录失败");
          setIsLoading(false);
          return;
        }

        // 保存用户信息到 sessionStorage
        sessionStorage.setItem('user', JSON.stringify(data.user));

        // 根据用户角色和首次登录状态处理
        if (data.user.is_first_login) {
          onClose();
          onShowResetPassword?.();
        } else if (data.user.role === "DEALER") {
          // 经销商直接关闭登录模态框，让首页检测到变化并打开经销商模态框
          onClose();
        } else {
          window.location.href = "/workbench";
        }
      } else {
        // 管理员登录：使用自定义 API 认证
        const response = await fetch("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phone, password, loginType: 'admin' })
        });

        const data = await response.json();
        if (!response.ok) {
          setError(data.error || "登录失败");
          setIsLoading(false);
          return;
        }

        // 保存用户信息到 sessionStorage
        sessionStorage.setItem('user', JSON.stringify(data.user));

        // 根据首次登录状态处理
        if (data.user.is_first_login) {
          onClose();
          onShowResetPassword?.();
        } else {
          window.location.href = "/workbench";
        }
      }
    } catch (err) {
      console.error(err);
      setError("系统验证出错，请稍后再试。");
      setIsLoading(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-6">
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-md"
          />
          <AnimatePresence>
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -20, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -10, scale: 0.95 }}
                className="absolute top-12 left-1/2 -translate-x-1/2 z-[100] bg-white text-slate-800 px-5 py-3 rounded-full shadow-[0_8px_30px_rgb(0,0,0,0.08)] border border-slate-100 flex items-center gap-3 text-xs md:text-[13px] font-bold tracking-widest"
              >
                <div className="w-6 h-6 rounded-full bg-red-50 flex items-center justify-center shrink-0">
                  <AlertTriangle className="w-[14px] h-[14px] text-red-500" />
                </div>
                {error}
              </motion.div>
            )}
          </AnimatePresence>
          <motion.div 
            initial={{ opacity: 0, scale: 0.96, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 10 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="relative w-full max-w-[420px] bg-white rounded-[28px] shadow-[0_45px_80px_-16px_rgba(0,0,0,0.15)] overflow-hidden"
          >
            <div className="absolute top-6 right-6">
              <button 
                onClick={onClose}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-50 text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
              >
                <X size={16} strokeWidth={2.5} />
              </button>
            </div>

            <div className="p-10 pt-14 text-center pb-10">
              <img src="/NIHPLOD-logo.svg" alt="Auth" className="h-[34px] mx-auto mb-7" />
              <h2 className="text-xl font-bold text-slate-900 tracking-[0.14em]">管理员登录</h2>
            </div>
            
            {/* 被强制隐藏的入口层（先不要显示 tab） */}
            {false && (
              <div className="px-10 pb-4 flex gap-3">
                <button
                  type="button"
                  onClick={() => setLoginType('admin')}
                  className={`flex-1 py-2 px-3 rounded-lg text-sm font-bold transition-all duration-300 border ${
                    loginType === 'admin'
                      ? 'bg-[#8B7355]/10 text-[#8B7355] border-[#8B7355]/40 shadow-sm shadow-[#8B7355]/5'
                      : 'bg-transparent text-slate-400 border-transparent hover:bg-[#8B7355]/5 hover:text-[#8B7355]'
                  }`}
                >
                  管理员
                </button>
                <button
                  type="button"
                  onClick={() => setLoginType('dealer')}
                  className={`flex-1 py-2 px-3 rounded-lg text-sm font-bold transition-all duration-300 border ${
                    loginType === 'dealer'
                      ? 'bg-[#8B7355]/10 text-[#8B7355] border-[#8B7355]/40 shadow-sm shadow-[#8B7355]/5'
                      : 'bg-transparent text-slate-400 border-transparent hover:bg-[#8B7355]/5 hover:text-[#8B7355]'
                  }`}
                >
                  经销商
                </button>
              </div>
            )}
            
            <form onSubmit={handleLogin} className="px-10 pb-10 pt-2 flex flex-col gap-6">
              <div className="flex flex-col gap-2">
                <input 
                  type="text" 
                  required 
                  placeholder={loginType === 'dealer' ? "请输入手机号" : "请输入电子邮箱"}
                  className="block w-full bg-slate-50 border border-slate-100 rounded-xl py-3.5 px-5 text-[13px] text-slate-900 outline-none transition-all duration-300 focus:bg-white focus:border-[#C6A87C]/40 focus:ring-4 focus:ring-[#C6A87C]/15 placeholder:text-slate-300"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </div>

              <div className="flex flex-col gap-2">
                <div className="relative">
                  <input 
                    type={showPassword ? "text" : "password"} 
                    required 
                    placeholder={loginType === 'dealer' ? "请输入密码" : "请输入密码"}
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
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

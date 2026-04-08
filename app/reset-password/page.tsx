"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Lock, Check, ShieldAlert, ArrowRight, Eye, EyeOff } from "lucide-react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

interface UserSession {
  id: string;
  phone?: string;
  username?: string;
  full_name?: string;
  role?: string;
  is_first_login?: boolean;
}

export default function ResetPasswordPage() {
  const [user, setUser] = useState<UserSession | null>(null);
  const [oldPassword, setOldPassword] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showOldPassword, setShowOldPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // 检查是否是经销商登录
    const sessionUser = sessionStorage.getItem('user');
    if (sessionUser) {
      try {
        setUser(JSON.parse(sessionUser));
      } catch (e) {
        console.error('Failed to parse user session:', e);
      }
    }
  }, []);

  const isDealer = user?.role === 'DEALER';

  const requirements = [
    { label: "至少 8 个字符", met: password.length >= 8 },
    { label: "包含数字", met: /\d/.test(password) },
    { label: "包含特殊符号", met: /[^A-Za-z0-9]/.test(password) },
  ];

  const canSubmit = requirements.every(req => req.met) && password === confirmPassword && password !== "";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    setIsLoading(true);
    setError(null);
    
    try {
      if (isDealer && user?.id) {
        // 经销商改密码（需要验证旧密码，除非是首次登录）
        if (!user.is_first_login && !oldPassword) {
          setError("请输入当前密码");
          setIsLoading(false);
          return;
        }

        const response = await fetch("/api/auth/change-password", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userId: user.id,
            oldPassword: user.is_first_login ? user.phone : oldPassword,
            newPassword: password
          })
        });

        const data = await response.json();
        if (!response.ok) {
          setError(data.error || "密码修改失败");
          setIsLoading(false);
          return;
        }

        // 更新 sessionStorage 中的用户信息
        if (user) {
          const updatedUser = { ...user, is_first_login: false };
          sessionStorage.setItem('user', JSON.stringify(updatedUser));
        }

        setIsSuccess(true);
      } else {
        // 管理员改密码（通过 Supabase auth）
        const { data, error: authError } = await supabase.auth.updateUser({
          password: password,
        });

        if (authError) {
          throw authError;
        }

        if (data.user) {
          // 更新 profile 的 is_first_login 状态
          await supabase
            .from('profiles')
            .update({ is_first_login: false })
            .eq('id', data.user.id);
            
          setIsSuccess(true);
        }
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || "密码更新失败，请重试");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-white flex items-center justify-center p-6 overflow-hidden relative selection:bg-primary/10">
      {/* 装饰性背景 */}
      <div className="absolute top-1/4 left-1/4 w-64 h-64 bg-primary/5 blur-3xl rounded-full animate-pulse" />

      <motion.div 
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-xl bg-white border border-slate-100 p-12 rounded-2xl relative z-10 shadow-xl overflow-hidden"
      >
        <AnimatePresence mode="wait">
          {!isSuccess ? (
            <motion.div 
              key="form"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="space-y-10"
            >
              <div className="space-y-4">
                <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-red-50 text-red-600 border border-red-100 rounded-lg mb-2">
                  <ShieldAlert className="w-4 h-4" />
                  <span className="text-xs font-bold uppercase tracking-widest leading-none text-red-600">账户安全要求</span>
                </div>
                <h1 className="text-4xl font-extrabold text-slate-900 tracking-tight">
                  {isDealer ? "设置您的登录密码" : "修改初始密码"}
                </h1>
                <p className="text-slate-500 text-sm font-medium leading-relaxed">
                  {isDealer 
                    ? "为了保护您的经销商资质信息安全，请设置一个强密码。"
                    : "为了保护您的品牌资产与授权数据安全，所有初始账户必须在首次登录时设置高强度密码。"
                  }
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-8">
                {/* 验证旧密码 - 仅对非首次登录的经销商显示 */}
                {isDealer && !user?.is_first_login && (
                  <div className="space-y-2">
                    <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest ml-1">当前密码</label>
                    <div className="relative">
                      <input 
                        type={showOldPassword ? "text" : "password"} 
                        required 
                        placeholder="请输入当前密码"
                        className="block w-full bg-slate-50 border border-slate-100 rounded-xl py-4 pl-4 pr-12 text-slate-900 font-mono text-sm focus:outline-none focus:ring-4 focus:ring-primary/5 transition-all shadow-sm"
                        value={oldPassword}
                        onChange={(e) => setOldPassword(e.target.value)}
                      />
                      <button 
                        type="button"
                        onClick={() => setShowOldPassword(!showOldPassword)}
                        className="absolute inset-y-0 right-0 pr-4 flex items-center text-slate-300 hover:text-slate-900 transition-colors"
                      >
                        {showOldPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest ml-1">设置新密码</label>
                    <div className="relative">
                      <input 
                        type={showPassword ? "text" : "password"} 
                        required 
                        placeholder="请输入新密码"
                        className="block w-full bg-slate-50 border border-slate-100 rounded-xl py-4 pl-4 pr-12 text-slate-900 font-mono text-sm focus:outline-none focus:ring-4 focus:ring-primary/5 transition-all shadow-sm"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                      />
                      <button 
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute inset-y-0 right-0 pr-4 flex items-center text-slate-300 hover:text-slate-900 transition-colors"
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest ml-1">确认新密码</label>
                    <div className="relative">
                      <input 
                        type={showPassword ? "text" : "password"} 
                        required 
                        placeholder="再次输入以确认"
                        className="block w-full bg-slate-50 border border-slate-100 rounded-xl py-4 pl-4 pr-12 text-slate-900 font-mono text-sm focus:outline-none focus:ring-4 focus:ring-primary/5 transition-all shadow-sm"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                      />
                      {confirmPassword && password === confirmPassword && (
                        <div className="absolute inset-y-0 right-0 pr-4 flex items-center text-emerald-500 font-bold text-xs">
                          <Check className="w-5 h-5 animate-in zoom-in duration-300" /> 一致
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* 错误提示 */}
                {error && (
                  <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm">
                    {error}
                  </div>
                )}

                {/* 密码强度检测卡片 */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-6 bg-slate-50 rounded-xl border border-slate-100">
                  {requirements.map((req, i) => (
                    <div key={i} className="flex items-center gap-2">
                       <div className={`w-2 h-2 rounded-full transition-all duration-500 ${req.met ? "bg-emerald-500 scale-125" : "bg-slate-200"}`} />
                       <span className={`text-[11px] font-bold transition-colors ${req.met ? "text-emerald-700" : "text-slate-400"}`}>
                        {req.label}
                       </span>
                    </div>
                  ))}
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full transition-all duration-500 ${confirmPassword === password && password !== "" ? "bg-emerald-500 scale-125" : "bg-slate-200"}`} />
                    <span className={`text-[11px] font-bold transition-colors ${confirmPassword === password && password !== "" ? "text-emerald-700" : "text-slate-400"}`}>
                      两次输入一致
                    </span>
                  </div>
                </div>

                <button 
                  disabled={!canSubmit || isLoading}
                  className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold py-5 rounded-xl transition-all shadow-xl shadow-slate-100 flex items-center justify-center gap-3 active:scale-[0.98] disabled:opacity-50"
                >
                  {isLoading ? (
                    <div className="w-6 h-6 border-4 border-white/20 border-t-white rounded-full animate-spin" />
                  ) : (
                    <>
                      更新密码并登录
                      <ArrowRight className="w-6 h-6" />
                    </>
                  )}
                </button>
              </form>
            </motion.div>
          ) : (
            <motion.div 
              key="success"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="text-center py-10 space-y-8"
            >
              <div className="w-24 h-24 rounded-full bg-emerald-50 border border-emerald-100 flex items-center justify-center mx-auto mb-6 shadow-sm">
                <Check className="w-12 h-12 text-emerald-500" />
              </div>
              <div className="space-y-4">
                <h2 className="text-4xl font-extrabold text-slate-900 tracking-tight">安全更新成功</h2>
                <p className="text-slate-500 font-medium leading-relaxed">
                  {isDealer ? "您的密码已设置成功，现在可以登入您的账户了。" : "您的密码已成功同步至品牌核心安全数据库。现在您可以开始管理您的业务授权了。"}
                </p>
              </div>
              <div className="pt-6">
                <Link href={isDealer ? "/dealer" : "/login"} className="inline-flex items-center gap-3 px-10 py-5 bg-slate-900 text-white font-bold rounded-xl hover:bg-slate-800 transition-all shadow-2xl shadow-slate-200 active:scale-95">
                  {isDealer ? "进入我的账户" : "登入工作台"}
                  <ArrowRight className="w-6 h-6" />
                </Link>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </main>
  );
}

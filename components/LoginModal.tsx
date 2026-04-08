"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Lock, Eye, EyeOff, ArrowRight, X } from "lucide-react";
import { supabase } from "@/lib/supabase";

export default function LoginModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loginType, setLoginType] = useState<'dealer' | 'admin'>('dealer');

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

        if (data.user.is_first_login) {
          window.location.href = "/reset-password";
        } else {
          window.location.href = "/workbench";
        }
      } else {
        // 管理员登录：用 Supabase auth
        const { data, error: authError } = await supabase.auth.signInWithPassword({
          email: phone,
          password,
        });

        if (authError) {
          setError("账号或密码错误，请核对后重试。");
          setIsLoading(false);
          return;
        }

        if (data.user) {
          const { data: profile } = await supabase
            .from("profiles")
            .select("is_first_login")
            .eq("id", data.user.id)
            .single();

          if (profile?.is_first_login) {
            window.location.href = "/reset-password";
          } else {
            window.location.href = "/workbench";
          }
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
              <h2 className="text-xl font-bold text-slate-900 tracking-[0.14em]">统一登录</h2>
            </div>
            
            {/* 登录类型选择 */}
            <div className="px-10 pb-4 flex gap-3">
              <button
                type="button"
                onClick={() => setLoginType('dealer')}
                className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all ${
                  loginType === 'dealer'
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                经销商
              </button>
              <button
                type="button"
                onClick={() => setLoginType('admin')}
                className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all ${
                  loginType === 'admin'
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                管理员
              </button>
            </div>
            
            <form onSubmit={handleLogin} className="px-10 pb-10 pt-2 flex flex-col gap-6">
              <div className="flex flex-col gap-2">
                <input 
                  type="text" 
                  required 
                  placeholder={loginType === 'dealer' ? "请输入手机号" : "请输入电子邮箱"}
                  className="block w-full bg-slate-50 border border-slate-100 rounded-xl py-3.5 px-5 text-[13px] text-slate-900 outline-none transition-all duration-300 focus:bg-white focus:border-slate-300 focus:ring-2 focus:ring-slate-900/5 placeholder:text-slate-300"
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
                    className="block w-full bg-slate-50 border border-slate-100 rounded-xl py-3.5 px-5 text-[13px] text-slate-900 outline-none transition-all duration-300 focus:bg-white focus:border-slate-300 focus:ring-2 focus:ring-slate-900/5 placeholder:text-slate-300"
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

              {error && (
                <div className="text-xs text-red-600 bg-red-50 rounded-lg py-2.5 px-3">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={isLoading}
                className="w-full bg-slate-900 text-white rounded-xl py-3.5 font-semibold text-[13px] hover:bg-slate-800 hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300 flex items-center justify-center gap-2"
              >
                {isLoading ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
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
                    placeholder="请输入您的系统密码"
                    className="block w-full bg-slate-50 border border-slate-100 rounded-xl py-3.5 px-5 pr-12 text-[13px] text-slate-900 outline-none transition-all duration-300 focus:bg-white focus:border-slate-300 focus:ring-2 focus:ring-slate-900/5 placeholder:text-slate-300 font-mono"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  <button 
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-600 transition-colors"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <AnimatePresence>
                {error && (
                  <motion.p 
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="text-red-500 text-[12px] font-bold text-center py-2 bg-red-50 rounded-lg border border-red-100"
                  >
                    {error}
                  </motion.p>
                )}
              </AnimatePresence>

              <button 
                type="submit" 
                disabled={isLoading}
                className="w-full mt-2 h-[46px] bg-[#121212] text-white rounded-[14px] text-[13px] font-bold flex items-center justify-center gap-2 hover:bg-black active:scale-[0.98] transition-all disabled:opacity-50 shadow-xl shadow-slate-900/10"
              >
                {isLoading ? (
                  <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                ) : (
                  <>登录并验证身份 <ArrowRight className="w-4 h-4 ml-0.5 opacity-60" /></>
                )}
              </button>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

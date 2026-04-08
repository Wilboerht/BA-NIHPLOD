"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Lock, Check, ShieldAlert, Eye, EyeOff, X, Loader2 } from "lucide-react";

interface UserSession {
  id: string;
  phone?: string;
  username?: string;
  full_name?: string;
  role?: string;
  is_first_login?: boolean;
}

interface ResetPasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export default function ResetPasswordModal({ isOpen, onClose, onSuccess }: ResetPasswordModalProps) {
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
    if (!isOpen) return;
    
    // 检查是否是经销商登录
    const sessionUser = sessionStorage.getItem('user');
    if (sessionUser) {
      try {
        setUser(JSON.parse(sessionUser));
      } catch (e) {
        console.error('Failed to parse user session:', e);
      }
    }
  }, [isOpen]);

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
            requesterId: user.id,
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

        // 如果是首次登录，标记为已完成首次登录
        const isFirstLogin = user.is_first_login;
        if (isFirstLogin) {
          try {
            const completeResponse = await fetch("/api/auth/complete-first-login", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ userId: user.id })
            });

            if (!completeResponse.ok) {
              console.warn("更新首次登录状态失败，但继续进行");
            }
          } catch (err) {
            console.warn("更新首次登录状态失败：", err);
          }
        }

        // 更新 sessionStorage 中的用户信息
        if (user) {
          const updatedUser = { ...user, is_first_login: false };
          sessionStorage.setItem('user', JSON.stringify(updatedUser));
        }

        setIsSuccess(true);
        // 2秒后自动关闭
        setTimeout(() => {
          onSuccess?.();
          handleClose();
        }, 2000);
      } else {
        // 管理员改密码（通过 API）
        if (!oldPassword) {
          setError("请输入当前密码");
          setIsLoading(false);
          return;
        }

        const response = await fetch("/api/auth/change-password", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userId: user?.id,
            requesterId: user?.id,
            oldPassword: oldPassword,
            newPassword: password
          })
        });

        const data = await response.json();
        if (!response.ok) {
          setError(data.error || "密码修改失败");
          setIsLoading(false);
          return;
        }

        // 如果是首次登录，标记为已完成首次登录
        const isFirstLogin = user?.is_first_login;
        if (isFirstLogin) {
          try {
            const completeResponse = await fetch("/api/auth/complete-first-login", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ userId: user?.id })
            });

            if (!completeResponse.ok) {
              console.warn("更新首次登录状态失败，但继续进行");
            }
          } catch (err) {
            console.warn("更新首次登录状态失败：", err);
          }
        }

        // 更新 sessionStorage 中的用户信息
        if (user) {
          const updatedUser = { ...user, is_first_login: false };
          sessionStorage.setItem('user', JSON.stringify(updatedUser));
        }

        setIsSuccess(true);
        // 2秒后自动关闭
        setTimeout(() => {
          onSuccess?.();
          handleClose();
        }, 2000);
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || "密码更新失败，请重试");
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    setPassword("");
    setConfirmPassword("");
    setOldPassword("");
    setIsSuccess(false);
    setError(null);
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center p-4 md:p-6">
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleClose}
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-md"
          />
          
          <motion.div 
            initial={{ opacity: 0, scale: 0.96, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 20 }}
            className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden"
          >
            {/* 关闭按钮 */}
            <div className="absolute top-6 right-6 z-10">
              <button
                onClick={handleClose}
                className="w-10 h-10 flex items-center justify-center rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-slate-700 transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <AnimatePresence mode="wait">
              {!isSuccess ? (
                <motion.div 
                  key="form"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  className="p-8"
                >
                  {/* 标题 */}
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-12 h-12 rounded-lg bg-blue-50 flex items-center justify-center">
                      <Lock className="w-6 h-6 text-blue-600" />
                    </div>
                    <div>
                      <h2 className="text-2xl font-bold text-slate-900">设置密码</h2>
                      <p className="text-sm text-slate-600 mt-1">创建一个强密码保护您的账户</p>
                    </div>
                  </div>

                  <form onSubmit={handleSubmit} className="space-y-5">
                    {/* 当前密码 - 仅非首次登录时显示 */}
                    {!isDealer || !user?.is_first_login ? (
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-2">
                          当前密码
                        </label>
                        <div className="relative">
                          <input
                            type={showOldPassword ? "text" : "password"}
                            value={oldPassword}
                            onChange={(e) => setOldPassword(e.target.value)}
                            placeholder="输入当前密码"
                            className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none pr-10"
                          />
                          <button
                            type="button"
                            onClick={() => setShowOldPassword(!showOldPassword)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                          >
                            {showOldPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="text-sm text-slate-600 bg-blue-50 p-3 rounded-lg">
                        首次登录，请设置新密码
                      </div>
                    )}

                    {/* 新密码 */}
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">
                        新密码
                      </label>
                      <div className="relative">
                        <input
                          type={showPassword ? "text" : "password"}
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder="输入新密码"
                          className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none pr-10"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                        >
                          {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                        </button>
                      </div>
                    </div>

                    {/* 密码要求 */}
                    <div className="space-y-2">
                      {requirements.map((req, index) => (
                        <div key={index} className="flex items-center gap-2 text-sm">
                          <div className={`w-5 h-5 rounded-full flex items-center justify-center transition-all ${
                            req.met ? 'bg-green-100' : 'bg-slate-100'
                          }`}>
                            {req.met && <Check className="w-3 h-3 text-green-600" />}
                          </div>
                          <span className={req.met ? 'text-green-700 font-medium' : 'text-slate-600'}>
                            {req.label}
                          </span>
                        </div>
                      ))}
                    </div>

                    {/* 确认密码 */}
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">
                        确认密码
                      </label>
                      <input
                        type="password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="再次输入密码"
                        className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                      {password && confirmPassword && password !== confirmPassword && (
                        <p className="text-red-500 text-sm mt-2">密码不匹配</p>
                      )}
                    </div>

                    {/* 错误提示 */}
                    {error && (
                      <div className="flex items-center gap-3 p-3 bg-red-50 border border-red-200 rounded-lg">
                        <ShieldAlert className="w-5 h-5 text-red-600 flex-shrink-0" />
                        <p className="text-sm text-red-700">{error}</p>
                      </div>
                    )}

                    {/* 提交按钮 */}
                    <button
                      type="submit"
                      disabled={!canSubmit || isLoading}
                      className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-medium py-3 rounded-lg transition-all flex items-center justify-center gap-2"
                    >
                      {isLoading ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          处理中...
                        </>
                      ) : (
                        "设置密码"
                      )}
                    </button>
                  </form>
                </motion.div>
              ) : (
                <motion.div 
                  key="success"
                  initial={{ opacity: 0, scale: 0.96 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.96 }}
                  className="p-8 flex flex-col items-center justify-center min-h-96 text-center"
                >
                  <motion.div 
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mb-4"
                  >
                    <Check className="w-8 h-8 text-green-600" />
                  </motion.div>
                  <h3 className="text-xl font-bold text-slate-900 mb-2">密码设置成功</h3>
                  <p className="text-slate-600">您的密码已成功更新，即将关闭...</p>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

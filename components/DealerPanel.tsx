"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, FileText, Lock, Download, LogOut, ChevronDown } from "lucide-react";

interface Certificate {
  id: string;
  cert_number: string;
  status: string;
  start_date: string;
  end_date: string;
  auth_scope: string;
}

interface UserSession {
  id: string;
  phone?: string;
  username?: string;
  full_name?: string;
  role?: string;
}

interface DealerPanelProps {
  isOpen: boolean;
  user: UserSession | null;
  onClose: () => void;
}

export default function DealerPanel({ isOpen, user, onClose }: DealerPanelProps) {
  const [certificates, setCertificates] = useState<Certificate[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'certificates' | 'account'>('certificates');
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showOldPassword, setShowOldPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState(false);

  useEffect(() => {
    if (isOpen && user) {
      fetchCertificates();
    }
  }, [isOpen, user]);

  const fetchCertificates = async () => {
    setIsLoading(true);
    try {
      if (!user?.id) {
        console.error('User ID not available');
        setIsLoading(false);
        return;
      }

      if (process.env.NODE_ENV !== 'production') console.log('Fetching certificates for user:', user.id);

      // 第一步：通过 API 获取 profile 关联的 dealers
      const dealersRes = await fetch(`/api/db/profiles/${user.id}/dealers`);
      if (!dealersRes.ok) {
        console.error('Failed to fetch dealers');
        setIsLoading(false);
        return;
      }

      const dealersData = await dealersRes.json();
      const dealers = dealersData.data || [];
      
      if (!dealers.length) {
        console.warn('No dealer found for user:', user.id);
        setIsLoading(false);
        return;
      }

      // 第二步：获取第一个经销商的证书
      const dealerId = dealers[0].id;
      const certsRes = await fetch(`/api/db/dealers/${dealerId}/certificates`);
      if (!certsRes.ok) {
        console.error('Failed to fetch certificates');
        setIsLoading(false);
        return;
      }

      const certsData = await certsRes.json();
      setCertificates(certsData.data || []);
    } catch (err) {
      console.error('Error fetching certificates:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError(null);
    setPasswordSuccess(false);

    if (newPassword !== confirmPassword) {
      setPasswordError("新密码不一致");
      return;
    }

    if (newPassword.length < 8) {
      setPasswordError("密码至少 8 个字符");
      return;
    }

    setIsChangingPassword(true);
    try {
      const response = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: user?.id,
          requesterId: user?.id,
          oldPassword,
          newPassword
        })
      });

      const data = await response.json();
      if (!response.ok) {
        setPasswordError(data.error || "密码修改失败");
        return;
      }

      setPasswordSuccess(true);
      setOldPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setTimeout(() => setPasswordSuccess(false), 3000);
    } catch (err: unknown) {
      setPasswordError(err instanceof Error ? err.message : "修改失败");
    } finally {
      setIsChangingPassword(false);
    }
  };

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch (e) {
      console.error('Logout API error:', e);
    }
    window.location.href = "/";
  };

  const isValid = certificates.some(c => {
    const endDate = new Date(c.end_date);
    return endDate > new Date();
  });

  const expiredCerts = certificates.filter(c => {
    const endDate = new Date(c.end_date);
    return endDate <= new Date();
  });

  const validCerts = certificates.filter(c => {
    const endDate = new Date(c.end_date);
    return endDate > new Date();
  });

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/20 z-40 backdrop-blur-sm"
          />
          <motion.div
            initial={{ opacity: 0, x: 400 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 400 }}
            transition={{ type: "spring", damping: 20, stiffness: 300 }}
            className="fixed right-0 top-0 h-screen w-[420px] bg-white shadow-2xl z-50 overflow-y-auto"
          >
            {/* Header */}
            <div className="sticky top-0 bg-white border-b border-slate-100 p-6 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-slate-900">我的账户</h2>
                <p className="text-xs text-slate-500 mt-1">{user?.full_name}</p>
              </div>
              <button
                onClick={onClose}
                className="w-8 h-8 rounded-full bg-slate-100 text-slate-600 hover:text-slate-900 hover:bg-slate-200 transition-all flex items-center justify-center"
              >
                <X size={16} />
              </button>
            </div>

            {/* Tabs */}
            <div className="flex gap-0 border-b border-slate-100 px-4">
              <button
                onClick={() => setActiveTab('certificates')}
                className={`flex-1 py-4 text-sm font-medium transition-all relative ${
                  activeTab === 'certificates'
                    ? 'text-slate-900'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                <div className="flex items-center justify-center gap-2">
                  <FileText size={16} />
                  我的证书
                </div>
                {activeTab === 'certificates' && (
                  <div className="absolute bottom-0 left-0 right-0 h-1 bg-slate-900" />
                )}
              </button>
              <button
                onClick={() => setActiveTab('account')}
                className={`flex-1 py-4 text-sm font-medium transition-all relative ${
                  activeTab === 'account'
                    ? 'text-slate-900'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                <div className="flex items-center justify-center gap-2">
                  <Lock size={16} />
                  账户设置
                </div>
                {activeTab === 'account' && (
                  <div className="absolute bottom-0 left-0 right-0 h-1 bg-slate-900" />
                )}
              </button>
            </div>

            {/* Content */}
            <div className="p-6 space-y-6">
              {/* 证书标签页 */}
              {activeTab === 'certificates' && (
                <div className="space-y-6">
                  {isLoading ? (
                    <div className="flex items-center justify-center py-12">
                      <div className="w-6 h-6 border-2 border-slate-300 border-t-slate-900 rounded-full animate-spin" />
                    </div>
                  ) : (
                    <>
                      {/* 当前有效证书 */}
                      {validCerts.length > 0 && (
                        <div className="space-y-3">
                          <h3 className="text-sm font-bold text-slate-900">当前有效证书</h3>
                          {validCerts.map(cert => (
                            <motion.div
                              key={cert.id}
                              initial={{ opacity: 0, y: 10 }}
                              animate={{ opacity: 1, y: 0 }}
                              className="p-4 bg-emerald-50 border border-emerald-200 rounded-lg space-y-3"
                            >
                              <div className="flex items-start justify-between">
                                <div>
                                  <div className="text-sm font-bold text-slate-900">
                                    {cert.cert_number}
                                  </div>
                                  <div className="text-xs text-slate-600 mt-1">
                                    {new Date(cert.start_date).toLocaleDateString()} ~ {new Date(cert.end_date).toLocaleDateString()}
                                  </div>
                                </div>
                                <span className="px-2.5 py-1 bg-emerald-600 text-white text-xs font-bold rounded-full">
                                  有效
                                </span>
                              </div>
                              <div className="text-xs text-slate-700 line-clamp-2">
                                {cert.auth_scope}
                              </div>
                              <div className="flex gap-2 pt-3 border-t border-emerald-200">
                                <button className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-white text-emerald-600 border border-emerald-200 text-xs font-semibold hover:bg-emerald-50 transition-all">
                                  <Download size={14} />
                                  PNG
                                </button>
                                <button className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-white text-emerald-600 border border-emerald-200 text-xs font-semibold hover:bg-emerald-50 transition-all">
                                  <Download size={14} />
                                  PDF
                                </button>
                              </div>
                            </motion.div>
                          ))}
                        </div>
                      )}

                      {/* 历史过期证书 */}
                      {expiredCerts.length > 0 && (
                        <div className="space-y-3">
                          <h3 className="text-sm font-bold text-slate-900">历史证书</h3>
                          {expiredCerts.map(cert => (
                            <motion.div
                              key={cert.id}
                              initial={{ opacity: 0, y: 10 }}
                              animate={{ opacity: 1, y: 0 }}
                              className="p-4 bg-slate-50 border border-slate-200 rounded-lg opacity-60 space-y-3"
                            >
                              <div className="flex items-start justify-between">
                                <div>
                                  <div className="text-sm font-bold text-slate-600">
                                    {cert.cert_number}
                                  </div>
                                  <div className="text-xs text-slate-500 mt-1">
                                    {new Date(cert.start_date).toLocaleDateString()} ~ {new Date(cert.end_date).toLocaleDateString()}
                                  </div>
                                </div>
                                <span className="px-2.5 py-1 bg-slate-300 text-slate-700 text-xs font-bold rounded-full">
                                  已过期
                                </span>
                              </div>
                              <div className="text-xs text-slate-600 line-clamp-2">
                                {cert.auth_scope}
                              </div>
                            </motion.div>
                          ))}
                        </div>
                      )}

                      {certificates.length === 0 && (
                        <div className="py-12 text-center space-y-3">
                          <FileText size={32} className="mx-auto text-slate-300" />
                          <div className="text-sm text-slate-600">暂无证书</div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              {/* 账户设置标签页 */}
              {activeTab === 'account' && (
                <div className="space-y-6">
                  {/* 修改密码表单 */}
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 mb-4">修改密码</h3>
                    <form onSubmit={handleChangePassword} className="space-y-4">
                      <div>
                        <label className="block text-xs font-semibold text-slate-600 mb-2">
                          当前密码
                        </label>
                        <div className="relative">
                          <input
                            type={showOldPassword ? "text" : "password"}
                            value={oldPassword}
                            onChange={(e) => setOldPassword(e.target.value)}
                            placeholder="请输入当前密码"
                            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:bg-white focus:border-slate-300 focus:ring-2 focus:ring-slate-900/5"
                            required
                          />
                          <button
                            type="button"
                            onClick={() => setShowOldPassword(!showOldPassword)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                          >
                            {showOldPassword ? "隐" : "显"}
                          </button>
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-600 mb-2">
                          新密码
                        </label>
                        <div className="relative">
                          <input
                            type={showNewPassword ? "text" : "password"}
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            placeholder="请输入新密码（至少8位）"
                            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:bg-white focus:border-slate-300 focus:ring-2 focus:ring-slate-900/5"
                            required
                          />
                          <button
                            type="button"
                            onClick={() => setShowNewPassword(!showNewPassword)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                          >
                            {showNewPassword ? "隐" : "显"}
                          </button>
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-600 mb-2">
                          确认新密码
                        </label>
                        <input
                          type={showNewPassword ? "text" : "password"}
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          placeholder="再次输入新密码"
                          className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:bg-white focus:border-slate-300 focus:ring-2 focus:ring-slate-900/5"
                          required
                        />
                      </div>

                      {passwordError && (
                        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-600">
                          {passwordError}
                        </div>
                      )}

                      {passwordSuccess && (
                        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-600">
                          ✓ 密码修改成功
                        </div>
                      )}

                      <button
                        type="submit"
                        disabled={isChangingPassword || !oldPassword || !newPassword || !confirmPassword}
                        className="w-full py-2.5 bg-slate-900 text-white rounded-lg font-semibold text-sm hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                      >
                        {isChangingPassword ? "修改中..." : "确认修改"}
                      </button>
                    </form>
                  </div>

                  {/* 登出按钮 */}
                  <div className="pt-4 border-t border-slate-100">
                    <button
                      onClick={handleLogout}
                      className="w-full flex items-center justify-center gap-2 py-3 rounded-lg bg-red-50 text-red-600 font-semibold text-sm hover:bg-red-100 transition-all"
                    >
                      <LogOut size={16} />
                      登出
                    </button>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

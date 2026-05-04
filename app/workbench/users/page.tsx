"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search, UserPlus, UserCog, Key, Trash2, Info,
  ChevronDown, X, Eye, EyeOff, ShieldCheck, Loader2, CheckCircle2, Plus
} from "lucide-react";

const ROLE_OPTIONS = [
  {
    value: "SUPER_ADMIN",
    label: "管理员",
    desc: "最高权限，可核发证书与管理用户",
    color: "text-slate-900",
    dot: "bg-slate-900",
  },
  {
    value: "AUDITOR",
    label: "审核员",
    desc: "可受理初审，无法最终签发",
    color: "text-slate-400",
    dot: "bg-slate-300",
  },
];

interface CreateForm {
  fullName: string;
  username: string;
  password: string;
  role: string;
}

interface AdminUser {
  id: string;
  full_name: string;
  username: string;
  role: string;
  updated_at: string;
}

interface UserSession {
  id: string;
  phone?: string;
  username?: string;
  full_name?: string;
  role?: string;
  is_first_login?: boolean;
}

export default function AdminsManagementPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [currentUser, setCurrentUser] = useState<UserSession | null>(null);

  // 创建弹窗状态
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState<CreateForm>({ fullName: "", username: "", password: "", role: "AUDITOR" });
  const [showPwd, setShowPwd] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createSuccess, setCreateSuccess] = useState<string | null>(null);

  const fullNameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchData();
  }, []);

  // 弹窗打开时聚焦第一个输入框
  useEffect(() => {
    if (showCreate) {
      setTimeout(() => fullNameRef.current?.focus(), 80);
    }
  }, [showCreate]);

  const fetchData = async () => {
    setIsLoading(true);
    
    // 从服务端获取当前用户信息
    try {
      const res = await fetch('/api/auth/me');
      if (res.ok) {
        const data = await res.json();
        const user = data.user;
        setCurrentUser(user);
        
        // 如果用户角色是 DEALER，说明没有权限访问管理后台
        if (user?.role === 'DEALER') {
          alert("权限不足：您的账号非管理人员，请重新登录。");
          window.location.href = "/";
          return;
        }
      } else {
        // 未登录，跳回首页
        window.location.href = "/";
        return;
      }
    } catch (e) {
      console.error("Failed to fetch user:", e);
      window.location.href = "/";
      return;
    }

    // 获取所有管理员列表
    try {
      const res = await fetch('/api/admin/list');
      const result = await res.json();
      
      if (res.ok && result.data) {
        setUsers(result.data);
      } else {
        console.error('Failed to fetch admin list:', result.error);
      }
    } catch (err: unknown) {
      console.error('Fetch admin list error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const openCreate = () => {
    setForm({ fullName: "", username: "", password: "", role: "AUDITOR" });
    setCreateError(null);
    setCreateSuccess(null);
    setShowPwd(false);
    setShowCreate(true);
  };

  const closeCreate = () => {
    if (isSubmitting) return;
    setShowCreate(false);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError(null);
    setIsSubmitting(true);

    try {
      const res = await fetch("/api/admin/create-admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error);

      setCreateSuccess(`账户已创建！登录邮箱：${result.email}`);
      await fetchData(); // 刷新列表
      // 2 秒后自动关闭弹窗
      setTimeout(() => {
        setShowCreate(false);
        setCreateSuccess(null);
      }, 2000);
    } catch (err: unknown) {
      setCreateError(err instanceof Error ? err.message : "创建失败");
    } finally {
      setIsSubmitting(false);
    }
  };

  const updateUserRole = async (userId: string, newRole: string) => {
    try {
      const res = await fetch('/api/admin/update-user-role', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, newRole })
      });

      if (res.ok) {
        fetchData();
      } else {
        const data = await res.json();
        alert("更新失败: " + (data.error || "未知错误"));
      }
    } catch (err: unknown) {
      alert("更新出错: " + (err instanceof Error ? err.message : "未知错误"));
    }
  };

  const deleteUser = async (id: string, name: string) => {
    if (confirm(`确定要彻底移除管理员 "${name}" 吗？此操作不可逆。`)) {
      try {
        const res = await fetch("/api/admin/delete-user", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: id }),
        });
        
        const result = await res.json();
        
        if (res.ok && result.success) {
          alert(`✅ ${result.message}`);
          fetchData();
        } else {
          alert(`❌ ${result.error || "删除失败"}`);
        }
      } catch (err: unknown) {
        alert(`❌ 错误：${err instanceof Error ? err.message : "未知错误"}`);
      }
    }
  };

  const resetPassword = async (user: AdminUser) => {
    const newPass = prompt(`重置「${user.full_name}」的登录密码\n请输入新密码（至少 8 位，包含大小写字母和数字）：`);
    if (!newPass) return;
    if (newPass.length < 8) { alert("密码过短，至少需要 8 个字符。"); return; }
    if (!confirm(`确认将该账户密码强制改为 "${newPass}" 吗？`)) return;

    try {
      const res = await fetch("/api/admin/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id, newPassword: newPass }),
      });
      const result = await res.json();
      if (result.success) alert(`✅ 密码重置成功！`);
      else alert("❌ 重置失败：" + result.error);
    } catch (err: unknown) {
      alert("❌ 错误：" + (err instanceof Error ? err.message : "未知错误"));
    }
  };

  const filteredUsers = users.filter(u =>
    u.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    u.username?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="px-8 md:px-12 py-8 md:pt-10 md:pb-12 w-full max-w-7xl mx-auto flex flex-col flex-1 min-h-0">
      {/* 页头 */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-8">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-3">
              <UserCog className="w-7 h-7 text-slate-900" />
              管理员管理
            </h1>
            {/* 权限说明气泡 */}
            <div className="group relative">
              <div className="w-5 h-5 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 cursor-help hover:bg-slate-200 transition-colors">
                <Info className="w-3.5 h-3.5" />
              </div>
              <div className="absolute left-0 top-full mt-2 w-72 p-4 bg-white/95 backdrop-blur-md rounded-xl shadow-2xl border border-slate-100 opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto transition-all translate-y-2 group-hover:translate-y-0 z-[100]">
                <h4 className="text-[11px] font-bold text-slate-900 uppercase tracking-widest mb-3 border-b border-slate-50 pb-2">权限等级说明</h4>
                <div className="space-y-3">
                  {ROLE_OPTIONS.map(r => (
                    <div key={r.value} className="flex gap-2.5">
                      <div className={`w-1.5 h-1.5 rounded-full ${r.dot} mt-1.5 shrink-0`} />
                      <div className="flex flex-col">
                        <span className="text-[11px] font-bold text-slate-800">{r.label} ({r.value})</span>
                        <p className="text-[10px] text-slate-500 leading-relaxed">{r.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
          <p className="text-slate-500 text-[13px]">管理系统内部管理员及其对应的功能权限，请确保系统操作安全。</p>
        </motion.div>

        <motion.button
          whileHover={{ scale: 1.01, y: -1 }}
          whileTap={{ scale: 0.98 }}
          onClick={openCreate}
          className="text-slate-900 border-b border-slate-900/20 px-0 pb-0.5 flex items-center gap-2 hover:text-slate-500 hover:border-slate-900 transition-all font-bold tracking-wide"
        >
          <Plus className="w-3.5 h-3.5" />
          <span className="font-bold tracking-wide">添加管理账号</span>
        </motion.button>
      </div>

      {/* 用户列表 */}
      <div className="flex-1 min-h-0 overflow-hidden flex flex-col p-0">
        <div className="px-0 py-6 flex justify-between items-center bg-transparent border-b border-slate-100/50">
          <div className="relative w-full max-w-sm ml-2">
            <Search className="w-4 h-4 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="搜索姓名、邮箱或账号..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-50/50 border border-slate-100/50 rounded-xl pl-11 pr-5 py-2.5 text-[13px] outline-none focus:bg-white focus:border-slate-300 transition-all text-slate-900 placeholder:text-slate-400"
            />
          </div>
        </div>

        <div className="overflow-auto flex-1 min-h-0 relative">
          {isLoading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-slate-300 z-30 pointer-events-none">
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-slate-200 animate-pulse" />
                <div className="w-1.5 h-1.5 rounded-full bg-slate-300 animate-pulse delay-75" />
                <div className="w-1.5 h-1.5 rounded-full bg-slate-200 animate-pulse delay-150" />
              </div>
              <span className="text-[12px] font-medium tracking-widest uppercase">校验权限加密链路...</span>
            </div>
          )}
          <table className="w-full text-left text-sm whitespace-nowrap table-auto border-separate border-spacing-0">
            <thead className="text-slate-500 font-semibold uppercase tracking-wider text-xs bg-slate-50/80">
              <tr>
                <th className="px-6 py-4 border-b border-slate-100 sticky top-0 bg-slate-50/80 z-20 backdrop-blur-md">管理员主体</th>
                <th className="px-6 py-4 border-b border-slate-100 sticky top-0 bg-slate-50/80 z-20 backdrop-blur-md">系统角色</th>
                <th className="px-6 py-4 border-b border-slate-100 sticky top-0 bg-slate-50/80 z-20 backdrop-blur-md">唯一识别码</th>
                <th className="px-6 py-4 border-b border-slate-100 sticky top-0 bg-slate-50/80 z-20 backdrop-blur-md">账号状态</th>
                <th className="px-6 py-4 border-b border-slate-100 text-right sticky top-0 bg-slate-50/80 z-20 backdrop-blur-md">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 text-slate-700 font-medium">
              {!isLoading && filteredUsers.map((user) => (
                <tr key={user.id} className="hover:bg-blue-50/20 transition-colors group">
                  <td className="px-6 py-5">
                    <div className="flex flex-col gap-0.5">
                      <span className="font-bold text-slate-900 flex items-center gap-2 tracking-tight">
                        {user.full_name}
                        {user.id === currentUser?.id && (
                          <span className="text-[9px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-md font-bold uppercase tracking-tight">当前账号</span>
                        )}
                      </span>
                      <span className="text-[11px] text-slate-400 font-medium">{user.username}</span>
                    </div>
                  </td>
                  <td className="px-6 py-5">
                    <div className="relative inline-flex items-center min-w-[100px] group/select">
                      <span className={`text-[12px] font-extrabold transition-all tracking-tight ${
                        user.role === "SUPER_ADMIN" ? "text-slate-900" : "text-slate-400"
                      } ${user.id !== currentUser?.id ? "group-hover/select:underline group-hover/select:underline-offset-4 decoration-slate-300" : ""}`}>
                        {user.role === "SUPER_ADMIN" ? "管理员" : "审核员"}
                      </span>
                      <select
                        disabled={user.id === currentUser?.id}
                        value={user.role}
                        onChange={(e) => updateUserRole(user.id, e.target.value)}
                        className={`absolute inset-0 w-full h-full opacity-0 cursor-pointer ${user.id === currentUser?.id ? "cursor-not-allowed hidden" : ""} z-20`}
                        title={user.id === currentUser?.id ? "无法修改当前登录账号的角色" : "点击修改权限等级"}
                      >
                        <option value="SUPER_ADMIN">管理员</option>
                        <option value="AUDITOR">审核员</option>
                      </select>
                      {user.id !== currentUser?.id && (
                        <ChevronDown className="w-3 h-3 text-slate-300 ml-2 transition-transform group-hover/select:translate-y-0.5" />
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-5">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[10px] text-slate-400 font-mono tracking-tighter uppercase tabular-nums">{user.id}</span>
                      <span className="text-[10px] text-slate-300 font-medium">注册于 {new Date(user.updated_at).toLocaleDateString()}</span>
                    </div>
                  </td>
                  <td className="px-6 py-5">
                    <span className="inline-flex items-center gap-2 text-emerald-600 text-[11px] font-bold tracking-tight">
                      <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                      正常活跃
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => resetPassword(user)}
                        className="flex items-center gap-1.5 px-3 py-1.5 hover:bg-slate-100 text-slate-300 hover:text-slate-600 rounded-lg transition-all"
                        title="重置登录密码"
                      >
                        <Key className="w-3.5 h-3.5" />
                        <span className="text-[11px] font-bold">重置密码</span>
                      </button>
                      {user.id !== currentUser?.id && (
                        <button
                          onClick={() => deleteUser(user.id, user.full_name)}
                          className="p-2 hover:bg-red-50 text-slate-300 hover:text-red-500 rounded-lg transition-all"
                          title="移除此管理员"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── 创建新管理用户弹窗 ── */}
      <AnimatePresence>
        {showCreate && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-6 md:p-12">
            {/* 背景蒙层 */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={closeCreate}
              className="absolute inset-0 bg-white/60 backdrop-blur-md"
            />

            {/* 弹窗主体 */}
            <motion.div
              initial={{ opacity: 0, scale: 0.98, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.98, y: 15 }}
              transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1] }}
              className="relative bg-white rounded-[32px] shadow-2xl w-full max-w-md overflow-hidden border border-slate-100/80"
            >
              {/* 弹窗头部 */}
              <div className="px-10 pt-12 pb-6">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <h2 className="text-xl font-black text-slate-900 tracking-[0.05em]">开通管理权限</h2>
                    <p className="text-[12px] text-slate-400 font-medium tracking-wide">配置新成员的访问凭标与职裁范围</p>
                  </div>
                  <button
                    onClick={closeCreate}
                    disabled={isSubmitting}
                    className="w-10 h-10 flex items-center justify-center rounded-full bg-slate-50 text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-all active:scale-90"
                  >
                    <X size={18} strokeWidth={2.5} />
                  </button>
                </div>
              </div>

              {/* 表单 */}
              <form onSubmit={handleCreate} className="px-10 pb-12 space-y-7">
                <div className="space-y-5">
                  {/* 姓名 */}
                  <div className="space-y-2">
                    <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest ml-1">真实姓名</label>
                    <input
                      ref={fullNameRef}
                      type="text"
                      required
                      placeholder="后台识别名"
                      value={form.fullName}
                      onChange={e => setForm(f => ({ ...f, fullName: e.target.value }))}
                      disabled={isSubmitting || !!createSuccess}
                      className="w-full bg-slate-50 border border-slate-100 rounded-xl px-5 py-3 text-[14px] outline-none focus:bg-white focus:border-slate-300 transition-all text-slate-900 placeholder:text-slate-200"
                    />
                  </div>

                  {/* 用户名 */}
                  <div className="space-y-2">
                    <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest ml-1">系统识别号 (USERNAME)</label>
                    <input
                      type="text"
                      required
                      placeholder="zhangsan@admin.nihplod.cn"
                      value={form.username}
                      onChange={e => setForm(f => ({ ...f, username: e.target.value }))}
                      disabled={isSubmitting || !!createSuccess}
                      className="w-full bg-slate-50 border border-slate-100 rounded-xl px-5 py-3 text-[14px] outline-none focus:bg-white focus:border-slate-300 transition-all font-mono text-slate-900 placeholder:text-slate-200"
                    />
                  </div>

                  {/* 密码 */}
                  <div className="space-y-2">
                    <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest ml-1">初始登录密码</label>
                    <div className="relative">
                      <input
                        type={showPwd ? "text" : "password"}
                        required
                        minLength={6}
                        placeholder="设置初始安全密码"
                        value={form.password}
                        onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                        disabled={isSubmitting || !!createSuccess}
                        className="w-full bg-slate-50 border border-slate-100 rounded-xl px-5 py-3 text-[14px] outline-none focus:bg-white focus:border-slate-300 transition-all text-slate-900 font-mono placeholder:text-slate-200"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPwd(v => !v)}
                        className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-600 transition-colors"
                      >
                        {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  {/* 角色 */}
                  <div className="space-y-2.5 pt-1">
                    <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest ml-1">角色权限分配</label>
                    <div className="space-y-2.5">
                      {ROLE_OPTIONS.map(opt => (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => setForm(f => ({ ...f, role: opt.value }))}
                          disabled={isSubmitting || !!createSuccess}
                          className={`w-full flex items-center justify-between p-4 rounded-2xl border transition-all text-left ${
                            form.role === opt.value
                              ? "border-slate-900 bg-slate-900/5 shadow-sm"
                              : "border-slate-50 bg-slate-50/50 hover:bg-white hover:border-slate-200 opacity-60"
                          }`}
                        >
                          <div className="space-y-1">
                            <span className={`text-[13px] font-bold block ${form.role === opt.value ? "text-slate-900" : "text-slate-400"}`}>
                              {opt.label}
                            </span>
                            <span className="text-[10px] text-slate-500 font-medium leading-relaxed block">{opt.desc}</span>
                          </div>
                          <div className={`w-4 h-4 rounded-full border-2 transition-all flex items-center justify-center ${
                            form.role === opt.value ? "border-slate-900 bg-slate-900" : "border-slate-200 bg-white"
                          }`}>
                            {form.role === opt.value && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* 状态反馈 */}
                <AnimatePresence>
                  {createError && (
                    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="text-center pt-2">
                       <p className="text-rose-500 text-[12px] font-bold bg-rose-50 py-3 rounded-xl border border-rose-100">{createError}</p>
                    </motion.div>
                  )}
                  {createSuccess && (
                    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="p-4 bg-emerald-50 rounded-2xl flex items-center gap-2 justify-center border border-emerald-100">
                      <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                      <span className="text-[12px] text-emerald-600 font-bold tracking-widest">管理账号已成功部署</span>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* 提交按钮 */}
                <div className="flex gap-4 pt-3">
                  <button
                    type="button"
                    onClick={closeCreate}
                    disabled={isSubmitting}
                    className="flex-1 h-12 text-slate-400 font-bold text-[13px] hover:bg-slate-50 rounded-2xl transition-all tracking-[0.1em]"
                  >
                    取消
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting || !!createSuccess || !form.fullName || !form.username || !form.password}
                    className="flex-[2.5] h-12 bg-[#2C2A29] text-white font-bold text-[13px] rounded-2xl hover:bg-black shadow-xl shadow-slate-900/10 transition-all flex items-center justify-center gap-2 disabled:opacity-30 disabled:pointer-events-none active:scale-95 tracking-[0.1em]"
                  >
                    {isSubmitting ? (
                      <><Loader2 className="w-4 h-4 animate-spin" /> 处理中</>
                    ) : (
                      "确认并创建账户"
                    )}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

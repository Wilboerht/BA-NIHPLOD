"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Search, UserPlus, ShieldCheck, UserCog, Mail, Info, Trash2, Key, AlertCircle, MoreHorizontal, ChevronDown } from "lucide-react";
import { supabase } from "@/lib/supabase";

export default function AdminsManagementPage() {
  const [users, setUsers] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setIsLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    setCurrentUser(user);

    // Fetch all internal users (non-DEALER roles)
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .neq('role', 'DEALER')
      .order('role', { ascending: true });

    if (!error && data) {
      setUsers(data);
    }
    setIsLoading(false);
  };

  const updateUserRole = async (userId: string, newRole: string) => {
    if (!window.confirm(`确定要将该用户的权限修改为 [${newRole}] 吗？`)) return;
    
    const { error } = await supabase.from('profiles').update({ role: newRole }).eq('id', userId);
    if (!error) {
      alert("权限更新成功！");
      fetchData();
    } else {
      alert("更新失败: " + error.message);
    }
  };

  const deleteUser = async (id: string, name: string) => {
    if (confirm(`确定要彻底移除管理员 "${name}" 吗？此操作不可逆。`)) {
      const { error } = await supabase.from('profiles').delete().eq('id', id);
      if (error) alert("删除失败：" + error.message);
      else fetchData();
    }
  };

  const resetPassword = async (user: any) => {
    const newPass = prompt(`正在重置管理员 "${user.full_name}" 的登录密码 (ID: ${user.username})\n请输入新密码 (至少6位)：`);
    
    if (newPass && newPass.length >= 6) {
      if (!confirm(`确认要将该账户的密码强制修改为 "${newPass}" 吗？`)) return;
      
      try {
        const res = await fetch('/api/admin/reset-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: user.id, newPassword: newPass })
        });
        
        const result = await res.json();
        
        if (result.success) {
          alert(`✅ 密码重置成功！\n管理员 "${user.full_name}" 现已可以使用新密码登录。`);
        } else {
          alert("❌ 重置失败：" + result.error);
        }
      } catch (err: any) {
        alert("❌ 网络或权限错误：" + err.message);
      }
    } else if (newPass) {
      alert("⚠️ 密码过短，至少需要 6 个字符。");
    }
  };

  const filteredUsers = users.filter(u => 
    u.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    u.username?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="px-8 md:px-12 py-8 md:pt-10 md:pb-12 w-full max-w-7xl mx-auto flex flex-col flex-1 min-h-0">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-8">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-3">
              <UserCog className="w-7 h-7 text-primary" />
              管理中心
            </h1>
            
            {/* 权限等级悬浮说明 */}
            <div className="group relative">
               <div className="w-5 h-5 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 cursor-help hover:bg-slate-200 transition-colors">
                 <Info className="w-3.5 h-3.5" />
               </div>
               
               {/* 气泡弹窗 */}
               <div className="absolute left-0 top-full mt-2 w-72 p-4 bg-white/95 backdrop-blur-md rounded-xl shadow-2xl border border-slate-100 opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto transition-all translate-y-2 group-hover:translate-y-0 z-[100]">
                  <h4 className="text-[11px] font-bold text-slate-900 uppercase tracking-widest mb-3 border-b border-slate-50 pb-2">权限等级说明</h4>
                  <div className="space-y-3">
                    <div className="flex gap-2.5">
                       <div className="w-1.5 h-1.5 rounded-full bg-slate-900 mt-1.5 shrink-0" />
                       <div className="flex flex-col">
                          <span className="text-[11px] font-bold text-slate-800">管理员 (ADMIN)</span>
                          <p className="text-[10px] text-slate-500 leading-relaxed">最高权限角色。具备全量核发、用户管理、系统参数配置等完整权限。</p>
                       </div>
                    </div>
                    <div className="flex gap-2.5">
                       <div className="w-1.5 h-1.5 rounded-full bg-slate-300 mt-1.5 shrink-0" />
                       <div className="flex flex-col">
                          <span className="text-[11px] font-bold text-slate-800">审核员 (AUDITOR)</span>
                          <p className="text-[10px] text-slate-500 leading-relaxed">仅具备资料的受理与初步核对权限。无法执行证书终审和最终下发。</p>
                       </div>
                    </div>
                  </div>
               </div>
            </div>
          </div>
          <p className="text-slate-500 text-[13px]">管理系统内部管理员及其对应的功能权限，请确保系统操作安全。</p>
        </motion.div>

        <button 
          onClick={() => alert("请使用 npm run scripts/createAdmin.mjs 脚本通过安全的命令行模式创建新管理员账户，以保障安全性。")}
          className="bg-slate-900 text-white font-medium h-10 px-6 rounded-lg shadow-md hover:bg-slate-800 transition-all flex items-center gap-2 active:scale-95 text-[13px]"
        >
          <UserPlus className="w-4 h-4" /> 邀请新管理员
        </button>
      </div>

      <div className="notion-card flex-1 min-h-0 overflow-hidden flex flex-col p-0">
        <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/30">
          <div className="relative w-full max-w-sm">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input 
              type="text" 
              placeholder="搜索管理员姓名或账户名称..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-white border border-slate-200 rounded-md pl-9 pr-4 py-2 text-[13px] outline-none focus:border-primary transition-colors focus:ring-2 focus:ring-primary/5"
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
              <span className="text-[12px] font-medium tracking-widest uppercase text-center">校验权限加密链路...</span>
            </div>
          )}
          <table className="w-full text-left text-sm whitespace-nowrap table-auto border-separate border-spacing-0">
            <thead className="text-slate-500 font-semibold uppercase tracking-wider text-xs bg-slate-50/80">
              <tr>
                <th className="px-6 py-4 border-b border-slate-100 sticky top-0 bg-slate-50/80 z-20 backdrop-blur-md text-left">管理员主体</th>
                <th className="px-6 py-4 border-b border-slate-100 sticky top-0 bg-slate-50/80 z-20 backdrop-blur-md text-left">系统角色</th>
                <th className="px-6 py-4 border-b border-slate-100 sticky top-0 bg-slate-50/80 z-20 backdrop-blur-md text-left">唯一识别码</th>
                <th className="px-6 py-4 border-b border-slate-100 sticky top-0 bg-slate-50/80 z-20 backdrop-blur-md text-left">账号状态</th>
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
                       <div className="relative inline-flex items-center min-w-[120px] group/select">
                         {/* 真正显示给用户看的极简文字 */}
                         <span className={`text-[12px] font-extrabold transition-all tracking-tight ${
                            user.role === 'SUPER_ADMIN' || user.role === 'PROJECT_MANAGER' ? 'text-slate-900 border-b-slate-900/10' : 
                            'text-slate-400'
                         } ${user.id !== currentUser?.id && 'group-hover/select:underline group-hover/select:underline-offset-4 decoration-slate-300'}`}>
                           {user.role === 'SUPER_ADMIN' || user.role === 'PROJECT_MANAGER' ? '管理员' : '审核员'}
                         </span>

                         {/* 底层原生的点击触发器（透明，但覆盖整个热区） */}
                         <select 
                           disabled={user.id === currentUser?.id}
                           value={user.role}
                           onChange={(e) => updateUserRole(user.id, e.target.value)}
                           className={`absolute inset-0 w-full h-full opacity-0 cursor-pointer ${user.id === currentUser?.id ? 'cursor-not-allowed hidden' : ''} z-20`}
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
                       <div className="flex items-center justify-end gap-1 transition-all duration-300">
                          <button 
                            onClick={() => resetPassword(user)}
                            className="flex items-center gap-1.5 px-3 py-1.5 hover:bg-slate-100 text-slate-300 hover:text-slate-600 rounded-lg transition-all" 
                            title="重置登录密码"
                          >
                             <Key className="w-3.5 h-3.5" />
                             <span className="text-[11px] font-bold">重置登录密码</span>
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
                ))
              }
            </tbody>
          </table>

          {!isLoading && filteredUsers.length === 0 && (
            <div className="absolute inset-0 top-12 flex flex-col items-center justify-center gap-3 text-slate-400 pointer-events-none">
              <div className="w-12 h-12 bg-slate-50 rounded-full flex items-center justify-center text-slate-200">
                <Search className="w-6 h-6" />
              </div>
              <span className="text-[13px] font-medium tracking-tight">未找到匹配的管理员记录</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

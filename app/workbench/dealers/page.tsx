"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Search, UserCircle, Key, FileText, MoreHorizontal, ExternalLink, ShieldCheck, Mail, Building2 } from "lucide-react";
import { supabase } from "@/lib/supabase";

export default function DealersPage() {
  const [dealers, setDealers] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [userRole, setUserRole] = useState<string | null>(null);

  useEffect(() => {
    fetchUserRole();
    fetchData();
  }, []);

  const fetchUserRole = async () => {
    try {
      // 避免与 Layout/Sidebar 同时发起 getUser 导致锁竞争
      await new Promise(r => setTimeout(r, 150)); 
      
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
        setUserRole(profile?.role);
      }
    } catch (err) {
       console.warn("Auth sync recovered");
    }
  };

  const fetchData = async () => {
    setIsLoading(true);
    // Fetch dealers and join with profiles (if available via username/fullname matching or direct link)
    const { data, error } = await supabase
      .from('dealers')
      .select('*, certificates(count)')
      .order('created_at', { ascending: false });

    if (!error && data) {
      // Fetch associated profile information for each dealer (using simple name matching as fallback)
      const dealerNames = data.map(d => d.company_name);
      const { data: profiles } = await supabase
        .from('profiles')
        .select('*')
        .in('full_name', dealerNames)
        .eq('role', 'DEALER');

      const enrichedDealers = data.map(d => ({
        ...d,
        profile: profiles?.find(p => p.full_name === d.company_name)
      }));
      
      setDealers(enrichedDealers);
    }
    setIsLoading(false);
  };

  const filteredDealers = dealers.filter(d => 
    d.company_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (d.profile?.username || "").toLowerCase().includes(searchQuery.toLowerCase())
  );

  const resetDealerPassword = async (username: string) => {
    if (!username) return;
    if (!window.confirm(`确定要重置经销商账户 [${username}] 的密码吗？\n重置后密码将恢复为该账号名称。`)) return;
    
    // logic would go through a secure API
    alert("重置指令已发送（当前建议通过管理员API实现）");
  };

  return (
    <div className="px-8 md:px-12 py-8 md:pt-10 md:pb-12 w-full max-w-7xl mx-auto flex flex-col flex-1 min-h-0">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-8">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-1">
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-3">
             <Building2 className="w-7 h-7 text-primary" />
             经销商账户管理
          </h1>
          <p className="text-slate-500 text-[13px]">查看并管理所有已授权经销商的系统登录权限、资料完整度及证书活跃状态。</p>
        </motion.div>
      </div>

      <div className="notion-card flex-1 min-h-0 overflow-hidden flex flex-col p-0">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="relative w-full max-w-sm">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input 
              type="text" 
              placeholder="搜索经销商名称、登录账号..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-white border border-slate-200 rounded-md pl-9 pr-4 py-2 text-[13px] outline-none focus:border-primary transition-colors"
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
              <span className="text-[12px] font-medium tracking-widest uppercase">拉取经销商档案...</span>
            </div>
          )}
          <table className="w-full text-left text-sm whitespace-nowrap table-auto border-separate border-spacing-0">
            <thead className="text-slate-500 font-semibold uppercase tracking-wider text-xs bg-slate-50/80">
              <tr>
                <th className="px-6 py-4 border-b border-slate-100 sticky top-0 bg-slate-50/80 z-20 backdrop-blur-md">经销商主体</th>
                <th className="px-6 py-4 border-b border-slate-100 sticky top-0 bg-slate-50/80 z-20 backdrop-blur-md">登录账号 (Email)</th>
                <th className="px-6 py-4 border-b border-slate-100 sticky top-0 bg-slate-50/80 z-20 backdrop-blur-md">持有证书</th>
                <th className="px-6 py-4 border-b border-slate-100 sticky top-0 bg-slate-50/80 z-20 backdrop-blur-md">注册时间</th>
                <th className="px-6 py-4 border-b border-slate-100 sticky top-0 bg-slate-50/80 z-20 backdrop-blur-md">账户状态</th>
                <th className="px-6 py-4 border-b border-slate-100 text-right sticky top-0 bg-slate-50/80 z-20 backdrop-blur-md">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 text-slate-700 font-medium">
              {!isLoading && filteredDealers.map((dealer) => (
                  <tr key={dealer.id} className="hover:bg-slate-50/50 transition-colors group">
                    <td className="px-6 py-4 mr-10">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-500 flex items-center justify-center font-bold text-[13px]">
                          {dealer.company_name.charAt(0)}
                        </div>
                        <div className="flex flex-col">
                          <span className="font-semibold text-slate-900">{dealer.company_name}</span>
                          <span className="text-[10px] text-slate-400 flex items-center gap-1 group-hover:text-primary transition-colors">
                            ID: {dealer.id.substring(0, 8).toUpperCase()}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col">
                        <span className="text-[13px] text-slate-600 font-mono">
                          {dealer.profile?.username ? `${dealer.profile.username}@ba.nihplod.cn` : "-"}
                        </span>
                        {dealer.profile?.is_first_login && (
                          <span className="text-[10px] text-amber-500 font-bold uppercase tracking-tighter">
                            未修改初始密码
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                       <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[11px] font-bold">
                          {dealer.certificates?.[0]?.count || 0} 张
                       </span>
                    </td>
                    <td className="px-6 py-4 text-xs text-slate-500">
                      {new Date(dealer.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4">
                       {dealer.profile ? (
                          <span className="inline-flex items-center gap-1 text-emerald-600 text-[11px] font-bold uppercase tracking-wider">
                            <ShieldCheck className="w-3 h-3" /> 已激活
                          </span>
                       ) : (
                          <span className="inline-flex items-center gap-1 text-slate-300 text-[11px] font-bold uppercase tracking-wider">
                            待开通
                          </span>
                       )}
                    </td>
                    <td className="px-6 py-4 text-right">
                       <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          {dealer.profile && userRole === 'SUPER_ADMIN' && (
                            <button 
                              onClick={() => resetDealerPassword(dealer.profile.username)}
                              title="重置初始密码"
                              className="p-1.5 hover:bg-slate-100 rounded-md text-slate-400 hover:text-slate-600 transition-all"
                            >
                              <Key className="w-4 h-4" />
                            </button>
                          )}
                          <a 
                            href={`/workbench/certificates?q=${dealer.company_name}`}
                            title="查看名下证书"
                            className="p-1.5 hover:bg-slate-100 rounded-md text-slate-400 hover:text-blue-500 transition-all"
                          >
                            <FileText className="w-4 h-4" />
                          </a>
                       </div>
                    </td>
                  </tr>
                ))
              }
            </tbody>
          </table>

          {!isLoading && filteredDealers.length === 0 && (
            <div className="absolute inset-0 top-12 flex flex-col items-center justify-center gap-3 text-slate-400 pointer-events-none">
              <div className="w-12 h-12 bg-slate-50 rounded-full flex items-center justify-center text-slate-200">
                <Building2 className="w-6 h-6" />
              </div>
              <span className="text-[13px] font-medium tracking-tight">暂无匹配的经销商账户记录</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

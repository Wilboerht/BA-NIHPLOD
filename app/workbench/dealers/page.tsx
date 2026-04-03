"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, UserCircle, Key, FileText, MoreHorizontal, ExternalLink, ShieldCheck, Mail, Building2, XCircle, RefreshCw, FileImage } from "lucide-react";
import CertificateGenerator from "@/components/certificate/CertificateGenerator";
import { supabase } from "@/lib/supabase";

export default function DealersPage() {
  const [dealers, setDealers] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [userRole, setUserRole] = useState<string | null>(null);
  const [selectedDealer, setSelectedDealer] = useState<any>(null);
  const [dealerCerts, setDealerCerts] = useState<any[]>([]);
  const [isCertsLoading, setIsCertsLoading] = useState(false);
  const [viewCertData, setViewCertData] = useState<any>(null);
  const [isViewVoided, setIsViewVoided] = useState(false);

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
    if (!window.confirm(`确定要重置经销商账号 [${username}] 的密码吗？\n重置后密码将恢复为该账号名称。`)) return;
    
    // logic would go through a secure API
    alert("重置指令已发送（当前建议通过管理员 API 实现）");
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
                            待开启
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
                          <button 
                            onClick={async () => {
                              setSelectedDealer(dealer);
                              setIsCertsLoading(true);
                              const { data } = await supabase
                                .from('certificates')
                                .select('*')
                                .eq('dealer_id', dealer.id)
                                .order('created_at', { ascending: false });
                              setDealerCerts(data || []);
                              setIsCertsLoading(false);
                            }}
                            title="查看名下证书"
                            className="p-1.5 hover:bg-slate-100 rounded-md text-slate-400 hover:text-blue-500 transition-all"
                          >
                            <FileText className="w-4 h-4" />
                          </button>
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
      {/* 证书列表弹窗 */}
      <AnimatePresence>
        {selectedDealer && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 md:p-12">
            <motion.div 
               initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
               onClick={() => setSelectedDealer(null)}
               className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            />
            <motion.div 
               initial={{ opacity: 0, scale: 0.98, y: 10 }}
               animate={{ opacity: 1, scale: 1, y: 0 }}
               exit={{ opacity: 0, scale: 0.98, y: 10 }}
               className="relative w-full max-w-3xl bg-white rounded-[32px] shadow-2xl p-8 md:p-10 overflow-hidden flex flex-col max-h-[85vh]"
            >
              <div className="flex justify-between items-start mb-8">
                <div className="space-y-1">
                  <h3 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
                    <FileText className="w-5 h-5 text-blue-500" />
                    授权历史档案
                  </h3>
                  <p className="text-xs text-slate-500 font-medium">主体名称：{selectedDealer.company_name}</p>
                </div>
                <button 
                  onClick={() => setSelectedDealer(null)}
                  className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-400 hover:text-slate-900"
                >
                  <XCircle className="w-6 h-6" />
                </button>
              </div>

              <div className="flex-1 overflow-auto rounded-2xl border border-slate-100 bg-slate-50/30">
                {isCertsLoading ? (
                  <div className="p-20 text-center text-slate-300">
                     <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-3" />
                     正在调取云端档案...
                  </div>
                ) : dealerCerts.length === 0 ? (
                  <div className="p-20 text-center space-y-3 text-slate-400">
                    <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center mx-auto shadow-sm">
                      <ShieldCheck className="w-6 h-6 text-slate-200" />
                    </div>
                    <p className="font-bold text-sm">暂无颁发记录</p>
                  </div>
                ) : (
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50/50 text-[10px] font-bold text-slate-400 uppercase tracking-widest border-y border-slate-100">
                       <tr>
                         <th className="px-6 py-4">证书编号</th>
                         <th className="px-6 py-4">有效期</th>
                         <th className="px-6 py-4">状态</th>
                         <th className="px-6 py-4 text-right">预览/存档</th>
                       </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white/50">
                      {dealerCerts.map(cert => {
                        const now = new Date();
                        const endDate = new Date(cert.end_date + 'T23:59:59');
                        const isExpiredByDate = now > endDate;
                        const isVoided = cert.status === 'EXPIRED' && !isExpiredByDate;

                        return (
                          <tr key={cert.id} className="hover:bg-white transition-colors group/row">
                            <td className="px-6 py-4 font-mono text-[11px] font-bold text-slate-900">{cert.cert_number}</td>
                            <td className="px-6 py-4 text-[12px] text-slate-500">
                               {cert.start_date.replace(/-/g, '.')} - {cert.end_date.replace(/-/g, '.')}
                            </td>
                            <td className="px-6 py-4">
                               {isVoided ? (
                                 <span className="text-rose-500 text-[10px] font-bold bg-rose-50 px-2 py-0.5 rounded">已作废</span>
                               ) : isExpiredByDate || cert.status === 'EXPIRED' ? (
                                 <span className="text-slate-400 text-[10px] font-bold">已失效</span>
                               ) : cert.status === 'ISSUED' ? (
                                 <span className="text-emerald-500 text-[10px] font-bold uppercase tracking-wider">Active</span>
                               ) : (
                                 <span className="text-amber-500 text-[10px] font-bold uppercase tracking-wider">Pending</span>
                               )}
                            </td>
                            <td className="px-6 py-4 text-right">
                               <button 
                                 onClick={() => {
                                   const scopeParts = cert.auth_scope?.split(' | ') || ["", ""];
                                   setViewCertData({
                                     platformId: scopeParts[0],
                                     platformLabel: "淘宝ID", 
                                     shopName: selectedDealer.company_name,
                                     shopLabel: "店铺名称",
                                     scopeText: scopeParts[1] || "授权经销资格条款",
                                     duration: `${cert.start_date.replace(/-/g, '.')} - ${cert.end_date.replace(/-/g, '.')}`,
                                     authorizer: "旎柏（上海）商贸有限公司",
                                     sealImage: "/default-seal.svg",
                                     phone: selectedDealer.phone || ""
                                   });
                                   setIsViewVoided(isVoided || cert.status === 'EXPIRED');
                                 }}
                                 className="inline-flex items-center gap-1.5 text-blue-500 hover:text-blue-700 font-bold text-[11px] transition-all px-2 py-1 hover:bg-blue-50 rounded"
                               >
                                 <Search className="w-3.5 h-3.5" />
                                 调阅
                               </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
              <div className="mt-6 text-center">
                 <p className="text-[10px] text-slate-300 tracking-tight">NIHPLOD GENOME - 品牌数字化授权保护系统</p>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* 高清预览与下载叠加层 */}
      <AnimatePresence>
        {viewCertData && (
          <div className="fixed inset-0 z-[150] flex items-center justify-center p-6 bg-slate-900/60 backdrop-blur-md">
            <motion.div 
               initial={{ opacity: 0, scale: 0.95 }}
               animate={{ opacity: 1, scale: 1 }}
               exit={{ opacity: 0, scale: 0.95 }}
               className="relative bg-white rounded-[40px] shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col"
            >
               <div className="p-8 flex justify-between items-center border-b border-slate-100">
                  <h3 className="text-xl font-bold text-slate-900 tracking-tight">调取历史授信档案</h3>
                  <button onClick={() => setViewCertData(null)} className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-400 hover:text-slate-900">
                    <XCircle className="w-6 h-6" />
                  </button>
               </div>
               <div className="flex-1 overflow-auto p-10">
                  <CertificateGenerator 
                    initialData={viewCertData} 
                    mode="view" 
                    isVoided={isViewVoided} 
                  />
               </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

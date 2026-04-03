"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Search, CheckCircle2, XCircle, FileImage, ShieldCheck } from "lucide-react";
import { supabase } from "@/lib/supabase";
import CertificateGenerator from "@/components/certificate/CertificateGenerator";

export default function CertificatesPage() {
  const [certificates, setCertificates] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [showIssueModal, setShowIssueModal] = useState(false);
  const [userRole, setUserRole] = useState<string | null>(null);

  useEffect(() => {
    fetchUserRole();
    fetchCertificates();
  }, [showIssueModal]); // refetch when modal closes

  const fetchUserRole = async () => {
    try {
      // 避免与侧边栏/父组件同时发起 getUser 导致锁竞争
      await new Promise(r => setTimeout(r, 100)); 
      
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
        setUserRole(profile?.role);
      }
    } catch (err) {
      console.warn("Auth Lock warning (recovered)", err);
    }
  };

  const fetchCertificates = async () => {
    setIsLoading(true);
    const { data, error } = await supabase
      .from('certificates')
      .select('*, dealers(company_name)')
      .order('created_at', { ascending: false });
      
    if (!error && data) {
      setCertificates(data);
    }
    setIsLoading(false);
  };

  const revokeCertificate = async (id: string, currentStatus: string) => {
    if (currentStatus === 'REVOKED') return;
    if (!window.confirm("确定要吊销此证书吗？一旦吊销，防伪系统将显示此证书失效。")) return;
    
    // Revoke updating status
    const { error } = await supabase.from('certificates').update({ status: 'REVOKED' }).eq('id', id);
    if (!error) {
      alert("证书已吊销！");
      fetchCertificates();
    } else {
    }
  };

  const approveCertificate = async (id: string) => {
    if (!window.confirm("确定审核通过并核发此授权书吗？\n系统将自动为经销商创建登录账户。")) return;
    
    setIsLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch('/api/certificates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          action: 'approve_issue', 
          certId: id,
          managerId: session?.user?.id
        })
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result.error);

      alert(`✅ 审核通过！授权书已核发。\n经销商账户已开通。`);
      fetchCertificates();
    } catch (err: any) {
      alert("核发失败：" + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const filteredCerts = certificates.filter(c => {
    const query = searchQuery.toLowerCase();
    return c.cert_number.toLowerCase().includes(query) || (c.dealers?.company_name || "").toLowerCase().includes(query);
  });

  return (
    <div className="px-8 md:px-12 py-8 md:pt-10 md:pb-12 w-full max-w-7xl mx-auto flex flex-col flex-1 min-h-0">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-8">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-1">
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-3">
             <ShieldCheck className="w-7 h-7 text-primary" />
             授权核发中心
          </h1>
          <p className="text-slate-500 text-[13px]">管理与监控所有的品牌官方合作授权书，一键生成带有防伪标签的高清大图。</p>
        </motion.div>
        
        <motion.button 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          onClick={() => setShowIssueModal(true)}
          className="bg-blue-600 text-white font-semibold h-10 px-6 rounded-lg shadow-lg shadow-blue-100 hover:bg-blue-700 transition-all flex items-center gap-2 active:scale-95 text-[13px]"
        >
          <Plus className="w-4 h-4" /> 新建核发证书
        </motion.button>
      </div>

      <div className="notion-card flex-1 min-h-0 overflow-hidden flex flex-col p-0 border-slate-100 bg-white">
        <div className="p-5 border-b border-slate-50 flex justify-between items-center bg-slate-50/30">
          <div className="relative w-full max-w-sm">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input 
              type="text" 
              placeholder="搜索证书编号或经销商名称..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-white border border-slate-200/60 rounded-xl pl-9 pr-4 py-2.5 text-[13px] outline-none focus:border-blue-400 transition-all focus:ring-4 focus:ring-blue-50/50 shadow-sm"
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
                <span className="text-[12px] font-medium tracking-widest uppercase">同步中心数据中...</span>
             </div>
          )}
          <table className="w-full text-left text-sm whitespace-nowrap table-auto border-separate border-spacing-0">
            <thead className="text-slate-400 font-bold uppercase tracking-widest text-[10px] bg-slate-50/50">
              <tr>
                <th className="px-6 py-5 border-b border-slate-100 sticky top-0 bg-slate-50/80 z-20 backdrop-blur-md">证书编号</th>
                <th className="px-6 py-5 border-b border-slate-100 sticky top-0 bg-slate-50/80 z-20 backdrop-blur-md">经销商名称</th>
                <th className="px-6 py-5 border-b border-slate-100 sticky top-0 bg-slate-50/80 z-20 backdrop-blur-md">授权范围</th>
                <th className="px-6 py-5 border-b border-slate-100 sticky top-0 bg-slate-50/80 z-20 backdrop-blur-md">有效期</th>
                <th className="px-6 py-5 border-b border-slate-100 sticky top-0 bg-slate-50/80 z-20 backdrop-blur-md">当前状态</th>
                <th className="px-6 py-5 border-b border-slate-100 text-right sticky top-0 bg-slate-50/80 z-20 backdrop-blur-md">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 text-slate-700 font-medium">
              {!isLoading && filteredCerts.map((cert) => (
                  <tr key={cert.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-6 py-4 font-mono text-xs">{cert.cert_number}</td>
                    <td className="px-6 py-4 font-semibold text-slate-900">{cert.dealers?.company_name || "-"}</td>
                    <td className="px-6 py-4 text-slate-600 text-[13px]">{cert.auth_scope || "-"}</td>
                    <td className="px-6 py-4 text-xs text-slate-500">
                      {new Date(cert.start_date).toLocaleDateString()} - {new Date(cert.end_date).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4">
                      {cert.status === 'ISSUED' ? (
                        <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-emerald-50 text-emerald-700 text-[11px] font-semibold tracking-wide uppercase">
                          <CheckCircle2 className="w-3 h-3" /> 生效中
                        </span>
                      ) : cert.status === 'REVOKED' ? (
                        <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-slate-100 text-slate-500 text-[11px] font-semibold tracking-wide uppercase">
                          <XCircle className="w-3 h-3" /> 已吊销
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-amber-50 text-amber-700 text-[11px] font-semibold tracking-wide uppercase">
                           待审核
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right flex items-center justify-end gap-3">
                       {cert.status === 'PENDING' && (userRole === 'SUPER_ADMIN' || userRole === 'PROJECT_MANAGER' || userRole === 'MANAGER') && (
                         <button 
                           onClick={() => approveCertificate(cert.id)}
                           className="text-[11px] text-blue-600 font-bold hover:underline uppercase tracking-wide"
                         >
                           核发授权
                         </button>
                       )}
                       {cert.status === 'ISSUED' && (
                         <button 
                           onClick={() => revokeCertificate(cert.id, cert.status)}
                           className="text-[11px] text-[#eb5757] font-bold hover:underline uppercase tracking-wide"
                         >
                           吊销执照
                         </button>
                       )}
                    </td>
                  </tr>
                ))
              }
            </tbody>
          </table>

          {!isLoading && filteredCerts.length === 0 && (
            <div className="absolute inset-0 top-12 flex flex-col items-center justify-center gap-3 text-slate-400 pointer-events-none">
              <div className="w-12 h-12 bg-slate-50 rounded-full flex items-center justify-center text-slate-200">
                <Search className="w-6 h-6" />
              </div>
              <span className="text-[13px] font-medium tracking-tight">暂无匹配的证书记录</span>
            </div>
          )}
        </div>
      </div>

      {/* 新建模态框复用原有的证书生成器（为了快速实现）*/}
      {showIssueModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-6 overflow-y-auto">
          <div className="bg-white rounded-3xl w-full max-w-6xl border border-slate-100 relative my-8 overflow-hidden">
             <div className="p-8 pb-4 flex justify-between items-center bg-white border-b border-transparent">
                <h3 className="text-lg font-bold text-slate-900 tracking-tight">签发授权书</h3>
                <button onClick={() => setShowIssueModal(false)} className="text-slate-400 hover:text-slate-700 bg-slate-50 hover:bg-slate-100 transition-colors p-2 rounded-full flex items-center justify-center">
                   <XCircle className="w-5 h-5" />
                </button>
             </div>
             <div className="p-8 max-h-[80vh] overflow-y-auto bg-white">
               <CertificateGenerator />
             </div>
          </div>
        </div>
      )}
    </div>
  );
}

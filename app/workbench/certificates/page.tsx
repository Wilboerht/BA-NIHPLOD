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

  useEffect(() => {
    fetchCertificates();
  }, [showIssueModal]); // refetch when modal closes

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
      alert("吊销失败：" + error.message);
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
          className="bg-slate-900 text-white font-medium h-10 px-6 rounded-lg shadow-md shadow-slate-200 hover:bg-slate-800 transition-all flex items-center gap-2 active:scale-95 text-[13px]"
        >
          <Plus className="w-4 h-4" /> 新建核发证书
        </motion.button>
      </div>

      <div className="notion-card flex-1 min-h-0 overflow-hidden flex flex-col p-0">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="relative w-full max-w-sm">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input 
              type="text" 
              placeholder="搜索证书编号或经销商名称..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-white border border-slate-200 rounded-md pl-9 pr-4 py-2 text-[13px] outline-none focus:border-primary transition-colors"
            />
          </div>
        </div>

        <div className="overflow-auto flex-1 min-h-0">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-slate-50/80 text-slate-500 font-semibold uppercase tracking-wider text-xs">
              <tr>
                <th className="px-6 py-4 border-b border-slate-100">证书编号</th>
                <th className="px-6 py-4 border-b border-slate-100">经销商名称</th>
                <th className="px-6 py-4 border-b border-slate-100">授权范围</th>
                <th className="px-6 py-4 border-b border-slate-100">有效期</th>
                <th className="px-6 py-4 border-b border-slate-100">当前状态</th>
                <th className="px-6 py-4 border-b border-slate-100 text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 text-slate-700 font-medium">
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-slate-400">加载数据中...</td>
                </tr>
              ) : filteredCerts.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-slate-400">找不到对应证书记录</td>
                </tr>
              ) : (
                filteredCerts.map((cert) => (
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
                    <td className="px-6 py-4 text-right">
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
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 新建模态框复用原有的证书生成器（为了快速实现）*/}
      {showIssueModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-6 overflow-y-auto">
          <div className="bg-white rounded-3xl w-full max-w-6xl shadow-2xl relative my-8 overflow-hidden">
             <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                <h3 className="text-xl font-extrabold text-slate-800">生成授权证书</h3>
                <button onClick={() => setShowIssueModal(false)} className="text-slate-400 hover:text-slate-700 bg-white shadow-sm p-2 rounded-full">关闭面板</button>
             </div>
             <div className="p-8 max-h-[80vh] overflow-y-auto">
               <CertificateGenerator />
             </div>
          </div>
        </div>
      )}
    </div>
  );
}

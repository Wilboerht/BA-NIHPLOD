"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Search, CheckCircle2, XCircle, FileImage, ShieldCheck, ShieldOff, Phone, X, Award } from "lucide-react";
import { supabase } from "@/lib/supabase";
import CertificateGenerator from "@/components/certificate/CertificateGenerator";

export default function CertificatesPage() {
  const [certificates, setCertificates] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [showIssueModal, setShowIssueModal] = useState(false);
  const [selectedCertData, setSelectedCertData] = useState<any>(null);
  const [isViewOnly, setIsViewOnly] = useState(false);
  const [isViewVoided, setIsViewVoided] = useState(false);

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
      .select('*, dealers(company_name, phone)')
      .order('created_at', { ascending: false });
      
    if (!error && data) {
      setCertificates(data);
    }
    setIsLoading(false);
  };

  const revokeCertificate = async (id: string, currentStatus: string) => {
    if (currentStatus === 'EXPIRED') return;
    if (!window.confirm("确定要吊销此证书吗？一旦吊销：\n该证书图像在防伪系统中将显示为已失效。如果您需要修正信息，请在吊销后重新签发。")) return;
    
    setIsLoading(true);
    try {
      const response = await fetch('/api/certificates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'revoke_certificate', certId: id })
      });
      
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);

      alert("✅ 证书已吊销，该授权在防伪系统中已失效。");
      fetchCertificates();
    } catch (err: any) {
      alert("吊销操作失败：" + err.message);
    } finally {
      setIsLoading(false);
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
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-10">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-1">
          <h1 className="text-2xl font-black text-slate-900 tracking-[0.05em] flex items-center gap-3">
             <ShieldCheck className="w-7 h-7 text-slate-900" />
             授权核发中心
          </h1>
          <p className="text-slate-500 text-[13px] font-medium tracking-wide">管理与监控品牌官方合作授权书，一键生成防伪溯源大图。</p>
        </motion.div>
        
        <motion.button
          whileHover={{ scale: 1.01, y: -1 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => {
            setSelectedCertData(null);
            setIsViewOnly(false);
            setIsViewVoided(false);
            setShowIssueModal(true);
          }}
          className="text-slate-900 border-b border-slate-900/20 px-0 pb-0.5 flex items-center gap-2 hover:text-slate-500 hover:border-slate-900 transition-all font-bold tracking-wide"
        >
          <Award className="w-3.5 h-3.5" />
          <span className="font-bold tracking-wide">核发新证书</span>
        </motion.button>
      </div>

      <div className="flex-1 min-h-0 overflow-hidden flex flex-col p-0">
        <div className="px-0 py-6 flex justify-between items-center bg-transparent border-b border-slate-100/50">
          <div className="relative w-full max-w-sm ml-2">
            <Search className="w-4 h-4 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
            <input 
              type="text" 
              placeholder="搜索证书编号或经销商名称..." 
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
                <span className="text-[12px] font-medium tracking-widest uppercase">同步中心数据中...</span>
             </div>
          )}
          <table className="w-full text-left text-sm whitespace-nowrap table-auto border-separate border-spacing-0">
            <thead className="text-slate-500 font-semibold uppercase tracking-wider text-xs bg-slate-50/80">
              <tr>
                <th className="px-6 py-4 border-b border-slate-50/0 sticky top-0 bg-slate-50/80 z-20 backdrop-blur-md">证书编号</th>
                <th className="px-6 py-4 border-b border-slate-50/0 sticky top-0 bg-slate-50/80 z-20 backdrop-blur-md">经销商名称</th>
                <th className="px-6 py-4 border-b border-slate-50/0 sticky top-0 bg-slate-50/80 z-20 backdrop-blur-md">联系方式</th>
                <th className="px-6 py-4 border-b border-slate-50/0 sticky top-0 bg-slate-50/80 z-20 backdrop-blur-md">有效期</th>
                <th className="px-6 py-4 border-b border-slate-50/0 sticky top-0 bg-slate-50/80 z-20 backdrop-blur-md text-center">当前状态</th>
                <th className="px-6 py-4 border-b border-slate-50/0 text-right sticky top-0 bg-slate-50/80 z-20 backdrop-blur-md">操作</th>
              </tr>
            </thead>
            <tbody className="text-slate-700 font-medium">
              {!isLoading && filteredCerts.map((cert) => (
                  <tr key={cert.id} className="hover:bg-slate-50/60 transition-all group duration-200">
                    <td className="px-6 py-6 font-mono text-[11px] text-slate-400 tracking-tighter uppercase tabular-nums">{cert.cert_number}</td>
                    <td className="px-6 py-6">
                       <span className="font-bold text-slate-900 text-[13px] tracking-tight">{cert.dealers?.company_name || "-"}</span>
                    </td>
                    <td className="px-6 py-6">
                      {cert.dealers?.phone ? (
                        <a href={`tel:${cert.dealers.phone}`} className="flex items-center gap-2 text-slate-400 hover:text-slate-900 transition-colors font-mono tabular-nums text-[12px]">
                          <Phone className="w-3 h-3 opacity-50" /> {cert.dealers.phone}
                        </a>
                      ) : (
                        <span className="text-slate-200 text-xs">未录入</span>
                      )}
                    </td>
                    <td className="px-6 py-6 text-[11px] text-slate-400 font-medium tabular-nums px-x uppercase tracking-wide">
                      {new Date(cert.start_date).toLocaleDateString()}—{new Date(cert.end_date).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-6 text-center">
                      {cert.status === 'ISSUED' && new Date() <= new Date(cert.end_date + 'T23:59:59') ? (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded bg-emerald-50 text-emerald-600 text-[10px] font-bold tracking-widest uppercase border border-emerald-100">
                          <CheckCircle2 className="w-3 h-3" /> 生效中
                        </span>
                      ) : (cert.status === 'EXPIRED' || (cert.status === 'ISSUED' && new Date() > new Date(cert.end_date + 'T23:59:59'))) ? (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded bg-slate-50 text-slate-400 text-[10px] font-bold tracking-widest uppercase border border-slate-100">
                          <XCircle className="w-3.5 h-3.5" /> 已失效
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded bg-amber-50 text-amber-600 text-[10px] font-bold tracking-widest uppercase border border-amber-100">
                           待审核
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right whitespace-nowrap align-middle">
                      <div className="flex items-center justify-end gap-1 opacity-60 group-hover:opacity-100 transition-opacity">
                        {cert.status === 'PENDING' && (userRole === 'SUPER_ADMIN' || userRole === 'PROJECT_MANAGER' || userRole === 'MANAGER') && (
                          <button 
                            onClick={() => approveCertificate(cert.id)}
                            className="bg-slate-900 text-white h-8 px-4 rounded-lg font-bold text-[11px] inline-flex items-center gap-2 transition-all hover:bg-black active:scale-95 tracking-wide leading-none"
                          >
                            <ShieldCheck className="w-3.5 h-3.5" />
                            核查准入
                          </button>
                        )}
                        {cert.status === 'ISSUED' && (
                          <button 
                            onClick={() => {
                              const scopeParts = cert.auth_scope?.split(' | ') || ["", ""];
                              setSelectedCertData({
                                cert_number: cert.cert_number,
                                platformId: scopeParts[0],
                                platformLabel: "识别码", 
                                shopName: cert.dealers?.company_name,
                                shopLabel: "授权主体",
                                scopeText: scopeParts[1] || "品牌官方经销授权",
                                duration: `${cert.start_date?.replace(/-/g, '.')} - ${cert.end_date?.replace(/-/g, '.')}`,
                                authorizer: "旎柏（上海）商贸有限公司",
                                sealImage: "/default-seal.svg",
                                phone: cert.dealers?.phone || ""
                              });
                              setIsViewVoided(false);
                              setIsViewOnly(true);
                              setShowIssueModal(true);
                            }}
                            className="text-slate-600 hover:bg-slate-100 h-8 px-4 rounded-lg font-bold text-[11px] inline-flex items-center gap-2 transition-all tracking-wide leading-none"
                          >
                            <FileImage className="w-3.5 h-3.5 opacity-60" />
                            查看证书
                          </button>
                        )}
                        {cert.status === 'EXPIRED' && (
                          <button 
                            onClick={() => {
                              const scopeParts = cert.auth_scope?.split(' | ') || ["", ""];
                              setSelectedCertData({
                                cert_number: cert.cert_number,
                                platformId: scopeParts[0],
                                platformLabel: "识别码", 
                                shopName: cert.dealers?.company_name,
                                shopLabel: "授权主体",
                                scopeText: scopeParts[1] || "品牌官方经销授权",
                                duration: `${cert.start_date?.replace(/-/g, '.')} - ${cert.end_date?.replace(/-/g, '.')}`,
                                authorizer: "旎柏（上海）商贸有限公司",
                                sealImage: "/default-seal.svg",
                                phone: cert.dealers?.phone || ""
                              });
                              setIsViewVoided(true);
                              setIsViewOnly(true);
                              setShowIssueModal(true);
                            }}
                            className="text-slate-600 hover:bg-slate-100 h-8 px-4 rounded-lg font-bold text-[11px] inline-flex items-center gap-2 transition-all tracking-wide leading-none shadow-sm shadow-slate-200/50"
                          >
                            <FileImage className="w-3.5 h-3.5 opacity-70" />
                            调阅档案
                          </button>
                        )}
                        {cert.status === 'ISSUED' && new Date() <= new Date(cert.end_date + 'T23:59:59') && (
                          <button 
                            onClick={() => revokeCertificate(cert.id, cert.status)}
                            className="text-slate-400 hover:text-rose-500 h-8 w-8 flex items-center justify-center rounded-lg hover:bg-rose-50 transition-all font-bold text-[11px] leading-none"
                            title="吊销授权"
                          >
                            <ShieldOff className="w-4 h-4" />
                          </button>
                        )}
                      </div>
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

      {/* ── 签发/调阅模态框 ── */}
      <AnimatePresence>
        {showIssueModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 md:p-12">
            {/* 背景蒙层 */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => {
                setShowIssueModal(false);
                setSelectedCertData(null);
                setIsViewOnly(false);
                setIsViewVoided(false);
              }}
              className="absolute inset-0 bg-white/60 backdrop-blur-md"
            />

            {/* 弹窗主体 */}
            <motion.div
              initial={{ opacity: 0, scale: 0.98, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.98, y: 15 }}
              transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1] }}
              className="relative bg-white rounded-[32px] shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden border border-slate-100/80"
            >
              <div className="px-10 pt-10 pb-6 flex justify-between items-center bg-white shrink-0">
                  <div className="space-y-1">
                    <h3 className="text-xl font-black text-slate-900 tracking-[0.05em]">
                      {isViewVoided ? "审阅历史授信档案" : isViewOnly ? "核对并调取授权证书" : "官方授权资质签发"}
                    </h3>
                    <p className="text-[12px] text-slate-400 font-medium tracking-wide">核实经销商主体资质，签发受防伪协议保护的电子证书</p>
                  </div>
                  <button 
                    onClick={() => {
                      setShowIssueModal(false);
                      setSelectedCertData(null);
                      setIsViewOnly(false);
                      setIsViewVoided(false);
                    }} 
                    className="w-10 h-10 flex items-center justify-center rounded-full bg-slate-50 text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-all active:scale-90"
                  >
                    <X size={18} strokeWidth={2.5} />
                  </button>
              </div>
              <div className="flex-1 overflow-y-auto px-10 pb-6 custom-scrollbar bg-slate-50/10">
                <div className="pt-0 pb-4">
                  <CertificateGenerator 
                    initialData={selectedCertData} 
                    mode={isViewOnly ? 'view' : 'create'} 
                    isVoided={isViewVoided}
                    onSuccess={() => {
                      setShowIssueModal(false);
                      setSelectedCertData(null);
                      setIsViewOnly(false);
                      setIsViewVoided(false);
                      fetchCertificates(); // 重新加载证书列表
                    }}
                  />
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, CheckCircle2, XCircle, FileImage, ShieldCheck, ShieldOff, Phone, X, Award, Edit, ChevronLeft, ChevronRight, Filter } from "lucide-react";
import CertificateGenerator, { CertData } from "@/components/certificate/CertificateGenerator";
import { useToast } from "@/hooks/useToast";
import { useEscapeKey } from "@/hooks/useEscapeKey";
import { useDebounce } from "@/hooks/useDebounce";
import { parseAuthScope, getEndOfDay } from "@/lib/utils";
import { fetchWithTimeout } from "@/lib/fetch";
import { COMPANY_FULL_NAME } from "@/lib/config";

interface Certificate {
  id: string;
  cert_number: string;
  status: string;
  start_date: string;
  end_date: string;
  auth_scope: string;
  seal_url?: string;
  templates?: { stamp_url?: string } | null;
  dealers?: { company_name?: string; phone?: string } | null;
}

export default function CertificatesPage() {
  const { toast, confirm } = useToast();
  const [certificates, setCertificates] = useState<Certificate[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [showIssueModal, setShowIssueModal] = useState(false);
  const [selectedCertData, setSelectedCertData] = useState<CertData | undefined>(undefined);
  const [isViewOnly, setIsViewOnly] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [isViewVoided, setIsViewVoided] = useState(false);
  const [pendingApproveId, setPendingApproveId] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  // 前端分页
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const [total, setTotal] = useState(0);
  const [statusFilter, setStatusFilter] = useState<'active' | 'all' | 'PENDING' | 'ISSUED' | 'invalid' | 'REVOKED' | 'REJECTED'>('active');

  const closeIssueModal = () => {
    setShowIssueModal(false);
    setSelectedCertData(undefined);
    setIsViewOnly(false);
    setIsEditMode(false);
    setIsViewVoided(false);
    setPendingApproveId(null);
  };

  useEscapeKey(closeIssueModal, showIssueModal);

  useEffect(() => {
    fetchUserRole();
    fetchCertificates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setPage(1);
  }, [searchQuery, statusFilter]);

  const fetchUserRole = async () => {
    try {
      const res = await fetchWithTimeout('/api/auth/me');
      if (res.ok) {
        const data = await res.json();
        setUserRole(data.user?.role ?? null);
      }
    } catch (err) {
      console.warn("Failed to fetch user role:", err);
    }
  };

  const fetchCertificates = async () => {
    setIsLoading(true);
    try {
      const response = await fetchWithTimeout(`/api/db/certificates?limit=10000`);
      const result = await response.json();
      
      if (!response.ok) throw new Error(result.error || '获取证书失败');
      
      setCertificates(result.data || []);
      setTotal(result.total || 0);
    } catch (err: unknown) {
      console.error('Failed to fetch certificates:', err);
      setCertificates([]);
      setTotal(0);
    } finally {
      setIsLoading(false);
    }
  };

  const revokeCertificate = async (id: string, currentStatus: string) => {
    if (currentStatus === 'EXPIRED') {
      toast({ message: "已过期证书无需吊销，其授权已自然失效。", type: "warning" });
      return;
    }
    const ok = await confirm({ message: "确定要吊销此证书吗？一旦吊销：\n该证书图像在防伪系统中将显示为已失效。如果您需要修正信息，请在吊销后重新签发。" });
    if (!ok) return;
    
    setRevokingId(id);
    try {
      const response = await fetchWithTimeout('/api/certificates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'revoke_certificate', certId: id })
      });
      
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);

      toast({ message: "证书已吊销，该授权在防伪系统中已失效。", type: "success" });
      fetchCertificates();
    } catch (err: unknown) {
      toast({ message: "吊销操作失败：" + (err instanceof Error ? err.message : "未知错误"), type: "error" });
    } finally {
      setRevokingId(null);
    }
  };

  const debouncedSearch = useDebounce(searchQuery, 300);

  // 计算证书的实际展示状态（处理 ISSUED 但已过期的情况）
  const getCertDisplayStatus = (cert: Certificate): string => {
    if (cert.status === 'REVOKED') return 'REVOKED';
    if (cert.status === 'REJECTED') return 'REJECTED';
    if (cert.status === 'EXPIRED') return 'EXPIRED';
    if (cert.status === 'ISSUED') {
      if (cert.end_date) {
        const end = getEndOfDay(cert.end_date.replace(/\./g, '-'));
        if (new Date() > end) return 'EXPIRED';
      }
      return 'ISSUED';
    }
    return 'PENDING';
  };

  const filteredCerts = certificates.filter(c => {
    const query = debouncedSearch.toLowerCase();
    const matchesSearch = !query || c.cert_number.toLowerCase().includes(query) || (c.dealers?.company_name || "").toLowerCase().includes(query);
    if (!matchesSearch) return false;

    const displayStatus = getCertDisplayStatus(c);
    switch (statusFilter) {
      case 'active':
        return displayStatus === 'PENDING' || displayStatus === 'ISSUED';
      case 'all':
        return true;
      case 'invalid':
        return displayStatus === 'EXPIRED' || displayStatus === 'REVOKED' || displayStatus === 'REJECTED';
      default:
        return displayStatus === statusFilter;
    }
  });

  const totalPages = Math.ceil(filteredCerts.length / pageSize);
  const paginatedCerts = filteredCerts.slice((page - 1) * pageSize, page * pageSize);

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
            setSelectedCertData(undefined);
            setIsViewOnly(false);
            setIsEditMode(false);
            setIsViewVoided(false);
            setShowIssueModal(true);
          }}
          className="text-slate-900 border-b border-slate-900/20 px-0 pb-0.5 flex items-center gap-2 hover:text-slate-500 hover:border-slate-900 transition-all font-bold tracking-wide"
        >
          <Award className="w-3.5 h-3.5" />
          <span className="font-bold tracking-wide">
            {userRole === 'SUPER_ADMIN' ? "核发新证书" : "提报新授权"}
          </span>
        </motion.button>
      </div>

      <div className="flex-1 min-h-0 overflow-hidden flex flex-col p-0">
        <div className="px-0 py-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-transparent border-b border-slate-100/50">
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
          <div className="flex items-center gap-1.5 flex-wrap">
            <Filter className="w-3.5 h-3.5 text-slate-400 mr-1" />
            {([
              { key: 'active', label: '活跃', desc: '待审核和生效中' },
              { key: 'all', label: '全部', desc: '所有证书' },
              { key: 'PENDING', label: '待审核', desc: '待审核' },
              { key: 'ISSUED', label: '生效中', desc: '生效中' },
              { key: 'invalid', label: '已失效', desc: '过期、吊销、拒绝' },
              { key: 'REVOKED', label: '已吊销', desc: '已吊销' },
              { key: 'REJECTED', label: '已拒绝', desc: '已拒绝' },
            ] as const).map((item) => (
              <button
                key={item.key}
                onClick={() => setStatusFilter(item.key)}
                title={item.desc}
                className={`px-3 py-1.5 rounded-lg text-[11px] font-bold tracking-wide transition-all ${
                  statusFilter === item.key
                    ? 'bg-slate-900 text-white shadow-sm'
                    : 'bg-slate-50 text-slate-500 hover:bg-slate-100 hover:text-slate-700'
                }`}
              >
                {item.label}
              </button>
            ))}
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
              {!isLoading && paginatedCerts.map((cert) => (
                  <tr key={cert.id} className="hover:bg-slate-50/60 transition-all group duration-200">
                    <td className="px-6 py-6 font-mono text-[11px] text-slate-400 tracking-tighter uppercase tabular-nums">{cert.cert_number}</td>
                    <td className="px-6 py-6">
                       <span className="font-bold text-slate-900 text-[13px] tracking-tight">{cert.dealers?.company_name || "-"}</span>
                    </td>
                    <td className="px-6 py-6">
                      {cert.dealers?.phone ? (
                        <span className="flex items-center gap-2 text-slate-400 font-mono tabular-nums text-[12px]">
                          <Phone className="w-3 h-3 opacity-50" /> {cert.dealers.phone}
                        </span>
                      ) : (
                        <span className="text-slate-200 text-xs">未录入</span>
                      )}
                    </td>
                    <td className="px-6 py-6 text-[11px] text-slate-400 font-medium tabular-nums px-x uppercase tracking-wide">
                      {new Date(cert.start_date).toLocaleDateString()}—{new Date(cert.end_date).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-6 text-center">
                      {(() => {
                        const displayStatus = getCertDisplayStatus(cert);
                        if (displayStatus === 'REVOKED') return (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded bg-rose-50 text-rose-600 text-[10px] font-bold tracking-widest uppercase border border-rose-100">
                            <ShieldOff className="w-3 h-3" /> 已吊销
                          </span>
                        );
                        if (displayStatus === 'REJECTED') return (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded bg-slate-50 text-slate-400 text-[10px] font-bold tracking-widest uppercase border border-slate-100">
                            <XCircle className="w-3 h-3" /> 已拒绝
                          </span>
                        );
                        if (displayStatus === 'EXPIRED') return (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded bg-slate-50 text-slate-400 text-[10px] font-bold tracking-widest uppercase border border-slate-100">
                            <XCircle className="w-3.5 h-3.5" /> 已失效
                          </span>
                        );
                        if (displayStatus === 'ISSUED') return (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded bg-emerald-50 text-emerald-600 text-[10px] font-bold tracking-widest uppercase border border-emerald-100">
                            <CheckCircle2 className="w-3 h-3" /> 生效中
                          </span>
                        );
                        return (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded bg-amber-50 text-amber-600 text-[10px] font-bold tracking-widest uppercase border border-amber-100">
                            待审核
                          </span>
                        );
                      })()}
                    </td>
                    <td className="px-6 py-4 text-right whitespace-nowrap align-middle">
                      <div className="flex items-center justify-end gap-1 opacity-60 group-hover:opacity-100 transition-opacity">
                        {cert.status === 'PENDING' && userRole === 'SUPER_ADMIN' && (
                          <button 
                            onClick={() => {
                              const parsed = parseAuthScope(cert.auth_scope);
                              setSelectedCertData({
                                id: cert.id,
                                cert_number: cert.cert_number,
                                companyName: parsed.companyName,
                                companyLabel: "公司名称",
                                shopName: cert.dealers?.company_name || "",
                                shopLabel: "授权主体",
                                scopeText: parsed.scopeText || "品牌官方经销授权",
                                duration: `${cert.start_date?.replace(/-/g, '.')} - ${cert.end_date?.replace(/-/g, '.')}`,
                                authorizer: parsed.authorizer || COMPANY_FULL_NAME,
                                sealImage: cert.seal_url || cert.templates?.stamp_url || "/default-seal.png",
                                phone: cert.dealers?.phone || ""
                              });
                              setPendingApproveId(cert.id);
                              setIsViewVoided(false);
                              setIsViewOnly(false);
                              setIsEditMode(true);
                              setShowIssueModal(true);
                            }}
                            className="bg-slate-900 text-white h-8 px-4 rounded-lg font-bold text-[11px] inline-flex items-center gap-2 transition-all hover:bg-black active:scale-95 tracking-wide leading-none"
                          >
                            <ShieldCheck className="w-3.5 h-3.5" />
                            核查准入
                          </button>
                        )}
                        {cert.status === 'ISSUED' && (
                          <button 
                            onClick={() => {
                              const parsed = parseAuthScope(cert.auth_scope);
                              setSelectedCertData({
                                id: cert.id,
                                cert_number: cert.cert_number,
                                companyName: parsed.companyName,
                                companyLabel: "公司名称", 
                                shopName: cert.dealers?.company_name || "",
                                shopLabel: "店铺或平台名称",
                                scopeText: parsed.scopeText || "品牌官方经销授权",
                                duration: `${cert.start_date?.replace(/-/g, '.')} - ${cert.end_date?.replace(/-/g, '.')}`,
                                authorizer: parsed.authorizer || COMPANY_FULL_NAME,
                                sealImage: cert.seal_url || cert.templates?.stamp_url || "/default-seal.png",
                                phone: cert.dealers?.phone || ""
                              });
                              setIsViewVoided(false);
                              setIsViewOnly(true);
                              setIsEditMode(false);
                              setShowIssueModal(true);
                            }}
                            className="text-slate-600 hover:bg-slate-100 h-8 px-4 rounded-lg font-bold text-[11px] inline-flex items-center gap-2 transition-all tracking-wide leading-none"
                          >
                            <FileImage className="w-3.5 h-3.5 opacity-60" />
                            查看证书
                          </button>
                        )}
                        {cert.status === 'ISSUED' && userRole === 'SUPER_ADMIN' && (
                          <button 
                            onClick={() => {
                              const parsed = parseAuthScope(cert.auth_scope);
                              setSelectedCertData({
                                id: cert.id,
                                cert_number: cert.cert_number,
                                companyName: parsed.companyName,
                                companyLabel: "公司名称", 
                                shopName: cert.dealers?.company_name || "",
                                shopLabel: "店铺或平台名称",
                                scopeText: parsed.scopeText || "品牌官方经销授权",
                                duration: `${cert.start_date?.replace(/-/g, '.')} - ${cert.end_date?.replace(/-/g, '.')}`,
                                authorizer: parsed.authorizer || COMPANY_FULL_NAME,
                                sealImage: cert.seal_url || cert.templates?.stamp_url || "/default-seal.png",
                                phone: cert.dealers?.phone || ""
                              });
                              setIsViewVoided(false);
                              setIsViewOnly(false);
                              setIsEditMode(true);
                              setShowIssueModal(true);
                            }}
                            className="text-[#8B7355] hover:bg-amber-50 h-8 w-8 flex items-center justify-center rounded-lg transition-all"
                            title="修改授权信息"
                          >
                            <Edit className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {cert.status === 'EXPIRED' && (
                          <button 
                            onClick={() => {
                              const parsed = parseAuthScope(cert.auth_scope);
                              setSelectedCertData({
                                cert_number: cert.cert_number,
                                companyName: parsed.companyName,
                                companyLabel: "公司名称", 
                                shopName: cert.dealers?.company_name || "",
                                shopLabel: "店铺或平台名称",
                                scopeText: parsed.scopeText || "品牌官方经销授权",
                                duration: `${cert.start_date?.replace(/-/g, '.')} - ${cert.end_date?.replace(/-/g, '.')}`,
                                authorizer: parsed.authorizer || COMPANY_FULL_NAME,
                                sealImage: cert.seal_url || cert.templates?.stamp_url || "/default-seal.png",
                                phone: cert.dealers?.phone || ""
                              });
                              setIsViewVoided(true);
                              setIsViewOnly(true);
                              setIsEditMode(false);
                              setShowIssueModal(true);
                            }}
                            className="text-slate-600 hover:bg-slate-100 h-8 px-4 rounded-lg font-bold text-[11px] inline-flex items-center gap-2 transition-all tracking-wide leading-none shadow-sm shadow-slate-200/50"
                          >
                            <FileImage className="w-3.5 h-3.5 opacity-70" />
                            调阅档案
                          </button>
                        )}
                        {cert.status === 'ISSUED' && cert.end_date && new Date() <= new Date(cert.end_date + 'T23:59:59') && (
                          <button
                            onClick={() => revokeCertificate(cert.id, cert.status)}
                            disabled={revokingId === cert.id}
                            className="text-slate-400 hover:text-rose-500 h-8 w-8 flex items-center justify-center rounded-lg hover:bg-rose-50 transition-all font-bold text-[11px] leading-none disabled:opacity-50"
                            title="吊销授权"
                          >
                            {revokingId === cert.id ? (
                              <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                            ) : (
                              <ShieldOff className="w-4 h-4" />
                            )}
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

        {/* 分页 */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-2 py-4 border-t border-slate-100">
            <span className="text-xs text-slate-400 font-medium">
              共 {total} 条，第 {page} / {totalPages} 页
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="p-2 rounded-lg bg-slate-50 text-slate-500 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="p-2 rounded-lg bg-slate-50 text-slate-500 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── 签发/调阅模态框 ── */}
      <AnimatePresence>
        {showIssueModal && (
          <div className="fixed inset-0 z-[100]">
            {/* 背景蒙层 */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={closeIssueModal}
              className="absolute inset-0 bg-black/20 backdrop-blur-sm"
            />

            {/* 弹窗主体 - 全屏从右滑入 */}
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 280 }}
              className="absolute inset-0 bg-white flex flex-col overflow-hidden"
            >
              <div className="px-8 md:px-12 pt-8 pb-5 flex justify-between items-center bg-white shrink-0 border-b border-slate-100">
                  <div className="space-y-1">
                    <h3 className="text-xl font-black text-slate-900 tracking-[0.05em]">
                      {pendingApproveId ? "审核准入核查" : isViewVoided ? "审阅历史授信档案" : isViewOnly ? "核对并调取授权证书" : isEditMode ? "修正官方授权资质信息" : (userRole === 'SUPER_ADMIN' ? "官方授权资质签发" : "授权资质审核提报")}
                    </h3>
                      <p className="text-[12px] text-slate-400 font-medium tracking-wide">
                        {pendingApproveId
                          ? "核对经销商资质信息与授权证书预览，确认无误后核发"
                          : isEditMode
                          ? "正在修正现有授权证书中的录入误差，提交后将同步刷新查验图"
                          : (userRole === 'SUPER_ADMIN'
                            ? "核实经销商主体资质，签发受防伪协议保护的电子证书"
                            : "录入经销商主体资质，提交品牌授权审核申请")}
                      </p>
                  </div>
                  <button
                    onClick={closeIssueModal}
                    className="w-10 h-10 flex items-center justify-center rounded-full bg-slate-50 text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-all active:scale-90"
                    aria-label="关闭"
                  >
                    <X size={18} strokeWidth={2.5} />
                  </button>
              </div>
              <div className="flex-1 overflow-y-auto px-8 md:px-12 py-6 custom-scrollbar bg-slate-50/10">
                <div className="max-w-5xl mx-auto">
                  <CertificateGenerator
                    initialData={selectedCertData}
                    mode={isViewOnly ? 'view' : isEditMode ? 'edit' : 'create'}
                    isVoided={isViewVoided}
                    isPending={!!pendingApproveId}
                    onSuccess={() => {
                      setShowIssueModal(false);
                      setSelectedCertData(undefined);
                      setIsViewOnly(false);
                      setIsEditMode(false);
                      setIsViewVoided(false);
                      setPendingApproveId(null);
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

"use client";

import { useState, useEffect, useCallback } from "react";
import { ADMIN_ROLES } from "@/types";
import { motion, AnimatePresence } from "framer-motion";
import {
  Home, Clock, ExternalLink, ShieldCheck, Megaphone, CheckCircle2,
  XCircle, AlertCircle, ChevronRight,
  Loader2, X
} from "lucide-react";
import Link from "next/link";
import { useToast } from "@/hooks/useToast";
import { useEscapeKey } from "@/hooks/useEscapeKey";
import { parseAuthScope } from "@/lib/utils";
import { fetchWithTimeout } from "@/lib/fetch";
import { COMPANY_FULL_NAME } from "@/lib/config";
import CertificateGenerator, { CertData } from "@/components/certificate/CertificateGenerator";

interface Complaint {
  id: string;
  channel: string;
  description: string;
  status: string;
  created_at: string;
  evidence_image_url?: string;   // 兼容旧数据
  evidence_image_urls?: string[];
  review_note?: string;
}

interface PendingCert {
  id: string;
  cert_number: string;
  auth_scope: string;
  start_date: string;
  end_date: string;
  status: string;
  created_at: string;
  dealers: { company_name: string; phone: string } | null;
  auditor_profile: { full_name: string; username: string } | null;
}

export default function WorkbenchPage() {
  const { toast, confirm } = useToast();
  const [stats, setStats] = useState({ certs: 0, validCerts: 0, pendingComplaints: 0, pendingCerts: 0 });
  const [recentComplaints, setRecentComplaints] = useState<Complaint[]>([]);
  const [pendingCerts, setPendingCerts] = useState<PendingCert[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [, setUserId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [showIssueModal, setShowIssueModal] = useState(false);
  const [selectedCertData, setSelectedCertData] = useState<CertData | undefined>(undefined);
  const [pendingApproveId, setPendingApproveId] = useState<string | null>(null);
  const [isViewVoided, setIsViewVoided] = useState(false);
  const [isViewOnly, setIsViewOnly] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);

  const fetchUserRole = useCallback(async () => {
    try {
      const res = await fetchWithTimeout('/api/auth/me');
      if (res.ok) {
        const data = await res.json();
        const user = data.user;
        // workbench 只接受管理员用户
        if (ADMIN_ROLES.includes(user?.role)) {
          return { role: user.role, uid: user.id };
        }
      }
    } catch (e) {
      console.error('Failed to fetch user role:', e);
    }
    return null;
  }, []);

  const loadDashboard = useCallback(async (role?: string) => {
    // 跳过非管理员的数据加载
    if (!role || !ADMIN_ROLES.includes(role as typeof ADMIN_ROLES[number])) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);

    try {
      // 获取统计数据
      const statsRes = await fetchWithTimeout('/api/db/stats');
      const statsData = await statsRes.json();
      
      // 获取最近的待处理投诉（PENDING + INVESTIGATING）
      const complaintsRes = await fetchWithTimeout('/api/db/complaints');
      const complaintsData = await complaintsRes.json();
      const recentComplaints = (complaintsData.data || [])
        .filter((c: Complaint) => c.status === 'PENDING' || c.status === 'INVESTIGATING')
        .slice(0, 4);
      
      // 获取待审证书
      const pendingRes = await fetchWithTimeout('/api/db/certificates/pending?limit=10000');
      const pendingData = await pendingRes.json();
      const pendingCerts = pendingData.data || [];

      setStats({
        certs: statsData.data?.totalCertificates || 0,
        validCerts: statsData.data?.issuedValid || 0,
        pendingComplaints: statsData.data?.pendingComplaints || 0,
        pendingCerts: pendingData.total || pendingCerts.length,
      });
      
      setRecentComplaints(recentComplaints);
      setPendingCerts(pendingCerts);
    } catch (err: unknown) {
      console.error('Failed to load dashboard:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    (async () => {
      const info = await fetchUserRole();
      if (info) {
        setUserRole(info.role);
        setUserId(info.uid);
        await loadDashboard(info.role);
      }
    })();
  }, [fetchUserRole, loadDashboard]);

  const closeIssueModal = () => {
    setShowIssueModal(false);
    setSelectedCertData(undefined);
    setPendingApproveId(null);
    setIsViewVoided(false);
    setIsViewOnly(false);
    setIsEditMode(false);
  };

  useEscapeKey(closeIssueModal, !!showIssueModal);

  const handleApprove = (cert: PendingCert) => {
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
      sealImage: "",
      phone: cert.dealers?.phone || ""
    });
    setPendingApproveId(cert.id);
    setIsViewVoided(false);
    setIsViewOnly(false);
    setIsEditMode(true);
    setShowIssueModal(true);
  };

  const handleReject = async (cert: PendingCert) => {
    const ok = await confirm({ message: `确定退回「${cert.dealers?.company_name}」的申请吗？\n此操作将把申请状态标记为已拒绝。` });
    if (!ok) return;
    setRejectingId(cert.id);
    try {
      const response = await fetchWithTimeout('/api/certificates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reject_pending', certId: cert.id }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      toast({ message: "申请已退回", type: "success" });
      await loadDashboard(userRole ?? undefined);
    } catch (err: unknown) {
      toast({ message: "退回操作失败：" + (err instanceof Error ? err.message : "未知错误"), type: "error" });
    } finally {
      setRejectingId(null);
    }
  };

  const handleRejectFromModal = async () => {
    if (!pendingApproveId) return;
    const cert = pendingCerts.find(c => c.id === pendingApproveId);
    const ok = await confirm({ message: `确定退回「${cert?.dealers?.company_name || selectedCertData?.shopName || '该'}」的申请吗？\n此操作将把申请状态标记为已拒绝。` });
    if (!ok) return;
    setRejectingId(pendingApproveId);
    try {
      const response = await fetchWithTimeout('/api/certificates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reject_pending', certId: pendingApproveId }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      toast({ message: "申请已退回", type: "success" });
      closeIssueModal();
      await loadDashboard(userRole ?? undefined);
    } catch (err: unknown) {
      toast({ message: "退回操作失败：" + (err instanceof Error ? err.message : "未知错误"), type: "error" });
    } finally {
      setRejectingId(null);
    }
  };

  const isAdmin = userRole === 'SUPER_ADMIN';

  return (
    <div className="px-4 md:px-10 py-8 md:pt-10 md:pb-12 w-full max-w-7xl mx-auto flex flex-col flex-1 min-h-0 gap-6 md:gap-8">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-1"
      >
        <h1 className="text-xl md:text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2 md:gap-3">
          <Home className="w-5 h-5 md:w-7 md:h-7 text-slate-900" />
          工作台首页
        </h1>
        <p className="text-slate-500 text-[11px] md:text-[13px]">欢迎来到 NIHPLOD 品牌授权管理大盘。</p>
      </motion.div>

      {/* 统计卡片 */}
      <div className={`grid grid-cols-2 gap-4 md:gap-6 ${isAdmin ? 'lg:grid-cols-4' : 'lg:grid-cols-3'}`}>
        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.05 }}
          className="notion-card flex items-center justify-between transition-all"
        >
          <div>
            <h3 className="text-[10px] md:text-xs font-semibold text-slate-500 uppercase tracking-widest mb-1 md:mb-3">累计核发证书</h3>
            <p className="text-2xl md:text-3xl font-bold text-slate-900 tracking-tight">{isLoading ? '-' : stats.certs}</p>
          </div>
          <div className="hidden md:flex w-12 h-12 rounded-full bg-slate-50 flex-shrink-0 items-center justify-center text-slate-300">
            <ShieldCheck className="w-6 h-6" />
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.08 }}
          className="notion-card flex items-center justify-between transition-all"
        >
          <div>
            <h3 className="text-[10px] md:text-xs font-semibold text-slate-500 uppercase tracking-widest mb-1 md:mb-3">当前有效授权</h3>
            <p className="text-2xl md:text-3xl font-bold text-slate-900 tracking-tight">{isLoading ? '-' : stats.validCerts}</p>
          </div>
          <div className="hidden md:flex w-12 h-12 rounded-full bg-slate-50 flex-shrink-0 items-center justify-center text-slate-400">
            <CheckCircle2 className="w-6 h-6" />
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.10 }}
          className="notion-card flex items-center justify-between transition-all"
        >
          <div>
            <h3 className="text-[10px] md:text-xs font-semibold text-slate-500 uppercase tracking-widest mb-1 md:mb-3">待审投诉工单</h3>
            <p className="text-2xl md:text-3xl font-bold text-slate-900 tracking-tight">{isLoading ? '-' : stats.pendingComplaints}</p>
          </div>
          <div className="hidden md:flex w-12 h-12 rounded-full bg-slate-50 flex-shrink-0 items-center justify-center text-slate-400">
            <Megaphone className="w-6 h-6" />
          </div>
        </motion.div>

        {isAdmin && (
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.13 }}
            className="notion-card flex items-center justify-between transition-all"
          >
            <div>
              <h3 className="text-[10px] md:text-xs font-semibold text-slate-500 uppercase tracking-widest mb-1 md:mb-3">待我核发授权</h3>
              <p className="text-2xl md:text-3xl font-bold text-slate-900 tracking-tight">
                {isLoading ? '-' : stats.pendingCerts}
              </p>
            </div>
            <div className="hidden md:flex w-12 h-12 rounded-full bg-slate-50 flex-shrink-0 items-center justify-center text-slate-400">
              <AlertCircle className="w-6 h-6" />
            </div>
          </motion.div>
        )}
      </div>

      {/* 双向待办工作台 (并排对齐且垂直撑满) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-stretch flex-1 min-h-0">
        {/* 待核发审批面板 / 我最近的提报（左侧面板） */}
        {(isAdmin || userRole === 'AUDITOR') && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ delay: 0.15 }}
            className="notion-card flex flex-col p-0 overflow-hidden h-full flex-1 bg-white border border-slate-100"
          >
            <div className="px-6 py-5 border-b border-slate-50 flex items-center justify-between bg-white shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-slate-50 border border-slate-100 flex items-center justify-center">
                  <ShieldCheck className="w-4 h-4 text-slate-900" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-800">
                    {isAdmin ? "审核员提交 · 待核发授权" : "我提交的授权申请"}
                  </h3>
                  <p className="text-[11px] text-slate-400 mt-0.5 font-medium tracking-tight">
                    {isAdmin ? "以下申请由审核员初审提报" : "实时跟踪您的提报与审核进度"}
                  </p>
                </div>
              </div>
              <Link
                href="/workbench/certificates"
                className="text-[11px] font-bold text-slate-400 hover:text-slate-700 transition-colors uppercase tracking-widest flex items-center gap-1"
              >
                全部 <ChevronRight className="w-3 h-3" />
              </Link>
            </div>

            <div className="flex-1 bg-white relative overflow-auto min-h-0">
              {isLoading ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-slate-300 pointer-events-none">
                  <Loader2 className="w-6 h-6 animate-spin text-slate-200" />
                  <span className="text-[11px] font-bold tracking-widest uppercase text-slate-400">同步申请队列...</span>
                </div>
              ) : pendingCerts.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center gap-3 text-slate-400 py-12">
                  <div className="hidden md:flex w-14 h-14 bg-white rounded-2xl items-center justify-center border border-slate-100">
                    <CheckCircle2 className="w-7 h-7 text-slate-200" />
                  </div>
                  <div className="text-center">
                    <p className="text-[13px] font-bold text-slate-600">审核队列已清空</p>
                    <p className="text-[11px] text-slate-400 mt-1">目前没有等待核发的授权申请。</p>
                  </div>
                </div>
              ) : (
                <table className="w-full text-left text-sm whitespace-nowrap table-auto border-separate border-spacing-0">
                  <thead className="text-slate-500 font-semibold uppercase tracking-wider text-xs bg-slate-50/80">
                    <tr>
                      <th className="px-4 py-3 border-b border-slate-100 sticky top-0 bg-slate-50/80 z-10 backdrop-blur-md">编号</th>
                      <th className="px-4 py-3 border-b border-slate-100 sticky top-0 bg-slate-50/80 z-10 backdrop-blur-md">店铺/平台名称</th>
                      <th className="px-4 py-3 border-b border-slate-100 sticky top-0 bg-slate-50/80 z-10 backdrop-blur-md">有效期</th>
                      <th className="px-4 py-3 border-b border-slate-100 text-right sticky top-0 bg-slate-50/80 z-10 backdrop-blur-md">操作</th>
                    </tr>
                  </thead>
                  <tbody className="text-slate-700 font-medium">
                    {pendingCerts.map((cert) => {
                      const isRejecting = rejectingId === cert.id;
                      const isBusy = isRejecting;
                      return (
                        <tr key={cert.id} className={`hover:bg-slate-50/60 transition-all group duration-200 ${isBusy ? 'opacity-50' : ''}`}>
                          <td className="px-4 py-3 font-mono text-[11px] text-slate-400 tracking-tighter uppercase tabular-nums">{cert.cert_number.slice(-4)}</td>
                          <td className="px-4 py-3">
                            <span className="font-bold text-slate-900 text-[13px] tracking-tight">{cert.dealers?.company_name || '-'}</span>
                          </td>
                          <td className="px-4 py-3 text-slate-400 text-[11px] tabular-nums">{cert.start_date.replace(/-/g, '.')} – {cert.end_date.replace(/-/g, '.')}</td>
                          <td className="px-4 py-3 text-right">
                            {isAdmin ? (
                              <div className="flex items-center justify-end gap-2">
                                <button onClick={() => handleReject(cert)} disabled={isBusy} className="inline-flex items-center gap-1 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-md px-2 py-1 transition-all active:scale-90 text-[11px] font-bold">
                                  {isRejecting ? <Loader2 className="w-3 h-3 animate-spin" /> : <XCircle className="w-3 h-3" />}
                                  退回
                                </button>
                                <button onClick={() => handleApprove(cert)} disabled={isBusy} className="inline-flex items-center gap-1 text-slate-400 hover:text-blue-500 hover:bg-blue-50 rounded-md px-2 py-1 transition-all active:scale-90 text-[11px] font-bold">
                                  <ShieldCheck className="w-3 h-3" />
                                  核发
                                </button>
                              </div>
                            ) : (
                              <span className="inline-flex items-center px-2 py-0.5 rounded bg-white text-slate-900 text-[10px] font-bold uppercase tracking-widest border border-slate-200">
                                待审核
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </motion.div>
        )}

        {/* 最新待处理举报 */}
        <div className="flex-1 notion-card flex flex-col p-0 overflow-hidden h-full bg-white border border-slate-100 transition-all">
          <div className="px-6 py-5 border-b border-slate-50 flex items-center justify-between bg-white shrink-0">
            <div className="flex items-center gap-3">
               <div className="w-8 h-8 rounded-lg bg-slate-50 border border-slate-100 flex items-center justify-center">
                 <Megaphone className="w-4 h-4 text-slate-900" />
               </div>
               <div>
                 <h3 className="text-sm font-bold text-slate-800">最新待处理举报</h3>
                 <p className="text-[11px] text-slate-400 mt-0.5 font-medium tracking-tight">来自官网访客的侵权反馈</p>
               </div>
            </div>
            <Link href="/workbench/complaints" className="text-[11px] font-bold text-slate-400 hover:text-slate-900 transition-colors uppercase tracking-widest flex items-center gap-1">
              处理中心 <ChevronRight className="w-3 h-3" />
            </Link>
          </div>

          <div className="flex-1 bg-white relative overflow-auto min-h-0">
            {isLoading ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-slate-300 pointer-events-none">
                <Loader2 className="w-6 h-6 animate-spin text-slate-200" />
                <span className="text-[11px] font-bold tracking-widest uppercase text-slate-400">拉取最新业务档案...</span>
              </div>
            ) : recentComplaints.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center gap-3 text-slate-400 py-12">
                <div className="hidden md:flex w-14 h-14 bg-white rounded-2xl items-center justify-center border border-slate-100">
                  <Clock className="w-7 h-7 text-slate-200" />
                </div>
                <div className="text-center">
                  <p className="text-[13px] font-bold text-slate-600">一切井然有序</p>
                  <p className="text-[11px] text-slate-400 mt-1">目前没有任何积压的待处理工单。</p>
                </div>
              </div>
            ) : (
              <table className="w-full text-left text-sm whitespace-nowrap table-auto border-separate border-spacing-0">
                <thead className="text-slate-500 font-semibold uppercase tracking-wider text-xs bg-slate-50/80">
                  <tr>
                    <th className="px-4 py-3 border-b border-slate-100 sticky top-0 bg-slate-50/80 z-10 backdrop-blur-md">工单编号</th>
                    <th className="px-4 py-3 border-b border-slate-100 sticky top-0 bg-slate-50/80 z-10 backdrop-blur-md">举报渠道</th>
                    <th className="px-4 py-3 border-b border-slate-100 sticky top-0 bg-slate-50/80 z-10 backdrop-blur-md">描述</th>
                    <th className="px-4 py-3 border-b border-slate-100 text-right sticky top-0 bg-slate-50/80 z-10 backdrop-blur-md">操作</th>
                  </tr>
                </thead>
                <tbody className="text-slate-700 font-medium">
                  {recentComplaints.map((complaint) => (
                    <tr key={complaint.id} className="hover:bg-slate-50/60 transition-all group duration-200">
                      <td className="px-4 py-3 font-mono text-[11px] text-slate-400 tracking-tighter uppercase tabular-nums">{complaint.id.split('-')[0]}</td>
                      <td className="px-4 py-3">
                        <span className="font-bold text-slate-900 text-[13px] tracking-tight">{complaint.channel}</span>
                      </td>
                      <td className="px-4 py-3 max-w-[180px]">
                        <span className="text-slate-500 text-[12px] truncate block">{complaint.description}</span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link href={`/workbench/complaints?id=${complaint.id}`} className="inline-flex items-center gap-1 text-slate-400 hover:text-blue-500 hover:bg-blue-50 rounded-md px-2 py-1 transition-all active:scale-90 text-[11px] font-bold">
                          处理 <ExternalLink className="w-3 h-3" />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {/* 核发/审核弹窗 */}
      <AnimatePresence>
        {showIssueModal && (
          <div className="fixed inset-0 z-[100]">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={closeIssueModal}
              className="absolute inset-0 bg-black/20 backdrop-blur-sm"
            />
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
                        ? "核实店铺或平台资质，签发受防伪协议保护的电子证书"
                        : "录入店铺或平台资质，提交品牌授权审核申请")}
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
                      closeIssueModal();
                      loadDashboard(userRole ?? undefined);
                    }}
                    onReject={handleRejectFromModal}
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

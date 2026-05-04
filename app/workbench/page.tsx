"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Home, Clock, ExternalLink, ShieldCheck, Megaphone, CheckCircle2,
  ShieldOff, XCircle, AlertCircle, ChevronRight, User, Calendar,
  Loader2, UserCog
} from "lucide-react";
import Link from "next/link";

interface Complaint {
  id: string;
  channel: string;
  description: string;
  status: string;
  created_at: string;
  evidence_image_url?: string;
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

interface UserSession {
  id: string;
  phone?: string;
  username?: string;
  full_name?: string;
  role?: string;
}

export default function WorkbenchPage() {
  const [stats, setStats] = useState({ certs: 0, validCerts: 0, pendingComplaints: 0, pendingCerts: 0 });
  const [recentComplaints, setRecentComplaints] = useState<Complaint[]>([]);
  const [pendingCerts, setPendingCerts] = useState<PendingCert[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);

  const fetchUserRole = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/me');
      if (res.ok) {
        const data = await res.json();
        const user = data.user;
        // workbench 只接受管理员用户
        if (user?.role === 'SUPER_ADMIN' || user?.role === 'AUDITOR' || user?.role === 'MANAGER' || user?.role === 'PROJECT_MANAGER') {
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
    if (!role || (role !== 'SUPER_ADMIN' && role !== 'AUDITOR' && role !== 'MANAGER' && role !== 'PROJECT_MANAGER')) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);

    try {
      // 获取统计数据
      const statsRes = await fetch('/api/db/stats');
      const statsData = await statsRes.json();
      
      // 获取最近的投诉
      const complaintsRes = await fetch('/api/db/complaints');
      const complaintsData = await complaintsRes.json();
      const recentComplaints = complaintsData.data?.slice(0, 4) || [];
      
      // 获取待审证书
      const pendingRes = await fetch('/api/db/certificates/pending?limit=6');
      const pendingData = await pendingRes.json();
      const pendingCerts = pendingData.data || [];

      setStats({
        certs: statsData.data?.totalCertificates || 0,
        validCerts: statsData.data?.issuedValid || 0,
        pendingComplaints: statsData.data?.pendingComplaints || 0,
        pendingCerts: pendingCerts.length,
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

  const handleApprove = async (cert: PendingCert) => {
    if (!window.confirm(`确定审核通过并核发「${cert.dealers?.company_name}」的授权书吗？\n系统将自动为经销商创建登录账户。`)) return;
    setProcessingId(cert.id);
    try {
      const response = await fetch('/api/certificates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'approve_issue', certId: cert.id }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      alert(`✅ 核发成功！\n授权书已签发，经销商账户已开通。`);
      await loadDashboard(userRole ?? undefined);
    } catch (err: unknown) {
      alert("核发失败：" + (err instanceof Error ? err.message : "未知错误"));
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async (cert: PendingCert) => {
    if (!window.confirm(`确定退回「${cert.dealers?.company_name}」的申请吗？\n此操作将把申请状态标记为已拒绝。`)) return;
    setRejectingId(cert.id);
    try {
      const response = await fetch('/api/certificates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reject_pending', certId: cert.id }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      await loadDashboard(userRole ?? undefined);
    } catch (err: unknown) {
      alert("退回操作失败：" + (err instanceof Error ? err.message : "未知错误"));
    } finally {
      setRejectingId(null);
    }
  };

  const isAdmin = userRole === 'SUPER_ADMIN' || userRole === 'MANAGER' || userRole === 'PROJECT_MANAGER';

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
            className="notion-card flex flex-col p-0 overflow-hidden h-full flex-1 bg-white border border-slate-100 shadow-sm"
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

            <div className="flex-1 bg-slate-50/20 px-2 py-4 relative overflow-auto min-h-0">
              {isLoading ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-slate-300 pointer-events-none">
                  <Loader2 className="w-6 h-6 animate-spin text-slate-200" />
                  <span className="text-[11px] font-bold tracking-widest uppercase text-slate-400">同步申请队列...</span>
                </div>
              ) : pendingCerts.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center gap-3 text-slate-400 py-12">
                  <div className="hidden md:flex w-14 h-14 bg-white rounded-2xl items-center justify-center shadow-sm border border-slate-100">
                    <CheckCircle2 className="w-7 h-7 text-slate-200" />
                  </div>
                  <div className="text-center">
                    <p className="text-[13px] font-bold text-slate-600">审核队列已清空</p>
                    <p className="text-[11px] text-slate-400 mt-1">目前没有等待核发的授权申请。</p>
                  </div>
                </div>
              ) : (
                <div className="space-y-2 pb-4">
                  <AnimatePresence>
                    {pendingCerts.map((cert) => {
                      const scopeParts = cert.auth_scope?.split(' | ') || ['', ''];
                      const platformId = scopeParts[0];
                      const isApproving = processingId === cert.id;
                      const isRejecting = rejectingId === cert.id;
                      const isBusy = isApproving || isRejecting;

                      return (
                        <motion.div
                          key={cert.id}
                          initial={{ opacity: 0, x: -8 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, x: 8, height: 0, marginBottom: 0, paddingTop: 0, paddingBottom: 0 }}
                          transition={{ duration: 0.2 }}
                          className={`bg-white rounded-xl border transition-all flex flex-col gap-4 p-4 ${isBusy ? 'border-slate-100 opacity-70' : 'border-slate-100 hover:border-amber-100 hover:shadow-sm'}`}
                        >
                          <div className="flex items-center gap-3">
                             <div className="w-8 h-8 rounded-lg bg-slate-50 flex-shrink-0 flex items-center justify-center">
                               <span className="text-[11px] font-black text-slate-900 font-mono">{cert.cert_number.slice(-4)}</span>
                             </div>
                             <div className="flex-1 min-w-0">
                               <p className="text-[13px] font-bold text-slate-900 truncate">{cert.dealers?.company_name || '未知经销商'}</p>
                               <p className="text-[10px] text-slate-400 font-mono mt-0.5 truncate">{platformId}</p>
                             </div>
                          </div>

                          <div className="flex items-center justify-between border-t border-slate-50 pt-3 mt-1">
                             <div className="flex items-center gap-3">
                                <div className="flex items-center gap-1 text-slate-400">
                                  <Calendar className="w-3 h-3" />
                                  <span className="text-[10px] tabular-nums">{cert.start_date.replace(/-/g, '.')} – {cert.end_date.replace(/-/g, '.')}</span>
                                </div>
                                <div className="flex items-center gap-1 text-slate-400">
                                  <User className="w-3 h-3" />
                                  <span className="text-[10px] truncate max-w-[80px]">{cert.auditor_profile?.full_name || '审核员'}</span>
                                </div>
                             </div>
                             <div className="flex items-center gap-2">
                                {isAdmin ? (
                                  <>
                                    <button onClick={() => handleReject(cert)} disabled={isBusy} className="p-1 text-slate-300 hover:text-rose-500 transition-colors">
                                      {isRejecting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <XCircle className="w-3.5 h-3.5" />}
                                    </button>
                                    <button onClick={() => handleApprove(cert)} disabled={isBusy} className="bg-slate-900 text-white rounded-lg px-3 py-1.5 text-[11px] font-bold hover:bg-black transition-all active:scale-95 shadow-sm">
                                      {isApproving ? <Loader2 className="w-3 h-3 animate-spin mx-auto" /> : "核发授权"}
                                    </button>
                                  </>
                                ) : (
                                  <div className="flex items-center">
                                    {cert.status === 'ISSUED' ? (
                                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-slate-900 text-white text-[10px] font-bold uppercase tracking-widest">
                                        已生效
                                      </span>
                                    ) : cert.status === 'REJECTED' ? (
                                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-slate-100 text-slate-400 text-[10px] font-bold uppercase tracking-widest border border-slate-200">
                                        未通过
                                      </span>
                                    ) : (
                                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-white text-slate-900 text-[10px] font-bold uppercase tracking-widest border border-slate-200 shadow-sm">
                                         待审核
                                      </span>
                                    )}
                                  </div>
                                )}
                             </div>
                          </div>
                        </motion.div>
                      );
                    })}
                  </AnimatePresence>
                </div>
              )}
            </div>
          </motion.div>
        )}

        {/* 最新待处理举报 */}
        <div className="flex-1 notion-card flex flex-col p-0 overflow-hidden h-full bg-white border border-slate-100 shadow-sm transition-all">
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

          <div className="flex-1 bg-slate-50/20 px-2 py-4 relative overflow-auto min-h-0">
            {isLoading ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-slate-300 pointer-events-none">
                <Loader2 className="w-6 h-6 animate-spin text-slate-200" />
                <span className="text-[11px] font-bold tracking-widest uppercase text-slate-400">拉取最新业务档案...</span>
              </div>
            ) : recentComplaints.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center gap-3 text-slate-400 py-12">
                <div className="hidden md:flex w-14 h-14 bg-white rounded-2xl items-center justify-center shadow-sm border border-slate-100">
                  <Clock className="w-7 h-7 text-slate-200" />
                </div>
                <div className="text-center">
                  <p className="text-[13px] font-bold text-slate-600">一切井然有序</p>
                  <p className="text-[11px] text-slate-400 mt-1">目前没有任何积压的待处理工单。</p>
                </div>
              </div>
            ) : (
              <div className="space-y-2 pb-4">
                {recentComplaints.map(complaint => (
                  <div key={complaint.id} className="bg-white p-4 rounded-xl border border-slate-100 flex items-center justify-between hover:border-blue-100 hover:shadow-sm transition-all group">
                    <div className="min-w-0 pr-4">
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className="text-[10px] font-mono text-slate-400 bg-slate-50 px-2 py-0.5 rounded uppercase">{complaint.id.split('-')[0]}</span>
                        <span className="text-xs font-bold text-slate-900">{complaint.channel}</span>
                      </div>
                      <p className="text-[12px] text-slate-500 line-clamp-1 font-medium italic">“{complaint.description}”</p>
                    </div>
                    <Link href={`/workbench/complaints?id=${complaint.id}`} className="shrink-0 p-2 text-slate-300 group-hover:text-blue-500 hover:bg-blue-50 rounded-lg transition-all active:scale-90">
                      <ExternalLink className="w-4 h-4" />
                    </Link>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useState, useEffect, useCallback } from "react";
import { ADMIN_ROLES } from "@/types";
import { motion, AnimatePresence } from "framer-motion";
import {
  Home, Clock, ExternalLink, ShieldCheck, Megaphone, CheckCircle2,
  XCircle, AlertCircle, ChevronRight, User, Calendar,
  Loader2
} from "lucide-react";
import Link from "next/link";
import { useToast } from "@/hooks/useToast";
import { parseAuthScope } from "@/lib/utils";
import { fetchWithTimeout } from "@/lib/fetch";

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
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);

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

  const handleApprove = async (cert: PendingCert) => {
    const ok = await confirm({ message: `确定审核通过并核发「${cert.dealers?.company_name}」的授权书吗？\n系统将自动为经销商创建登录账户。` });
    if (!ok) return;
    setProcessingId(cert.id);
    try {
      const response = await fetchWithTimeout('/api/certificates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'approve_issue', certId: cert.id }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      toast({ message: `核发成功！授权书已签发。`, type: "success" });
      await loadDashboard(userRole ?? undefined);
    } catch (err: unknown) {
      toast({ message: "核发失败：" + (err instanceof Error ? err.message : "未知错误"), type: "error" });
    } finally {
      setProcessingId(null);
    }
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
                      const isApproving = processingId === cert.id;
                      const isRejecting = rejectingId === cert.id;
                      const isBusy = isApproving || isRejecting;
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
                                <button onClick={() => handleReject(cert)} disabled={isBusy} className="p-1.5 text-slate-300 hover:text-rose-500 transition-colors rounded-md hover:bg-rose-50">
                                  {isRejecting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <XCircle className="w-3.5 h-3.5" />}
                                </button>
                                <button onClick={() => handleApprove(cert)} disabled={isBusy} className="bg-slate-900 text-white rounded-md px-3 py-1 text-[11px] font-bold hover:bg-black transition-all active:scale-95">
                                  {isApproving ? <Loader2 className="w-3 h-3 animate-spin" /> : '核发'}
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
                      <td className="px-4 py-3">
                        <span className="text-slate-500 text-[12px] line-clamp-1">{complaint.description}</span>
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
    </div>
  );
}

"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/lib/supabase";
import {
  Clock, ExternalLink, ShieldCheck, Megaphone, CheckCircle2,
  ShieldOff, XCircle, AlertCircle, ChevronRight, User, Calendar,
  Loader2
} from "lucide-react";
import Link from "next/link";

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
  const [stats, setStats] = useState({ certs: 0, validCerts: 0, pendingComplaints: 0, pendingCerts: 0 });
  const [recentComplaints, setRecentComplaints] = useState<any[]>([]);
  const [pendingCerts, setPendingCerts] = useState<PendingCert[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);

  const fetchUserRole = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      setUserId(user.id);
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
      setUserRole(profile?.role ?? null);
      return { role: profile?.role, uid: user.id };
    }
    return null;
  }, []);

  const loadDashboard = useCallback(async (role?: string) => {
    setIsLoading(true);

    const [
      { count: certCount },
      { count: complaintCount },
      { data: recent },
      { count: validCount },
    ] = await Promise.all([
      supabase.from('certificates').select('*', { count: 'exact', head: true }),
      supabase.from('complaints').select('*', { count: 'exact', head: true }).eq('status', 'PENDING'),
      supabase.from('complaints').select('id, channel, description, created_at, status').eq('status', 'PENDING').order('created_at', { ascending: false }).limit(4),
      supabase.from('certificates').select('*', { count: 'exact', head: true }).eq('status', 'ISSUED').gte('end_date', new Date().toISOString().split('T')[0]),
    ]);

    // 待审核证书（仅 SUPER_ADMIN 需要加载）
    let pendingList: PendingCert[] = [];
    let pendingCount = 0;
    if (role === 'SUPER_ADMIN' || role === 'MANAGER' || role === 'PROJECT_MANAGER') {
      const { data: pd, count: pc } = await supabase
        .from('certificates')
        .select('id, cert_number, auth_scope, start_date, end_date, status, created_at, auditor_id, dealers(company_name, phone)', { count: 'exact' })
        .eq('status', 'PENDING')
        .order('created_at', { ascending: true });

      pendingCount = pc || 0;

      if (pd && pd.length > 0) {
        // 批量获取 auditor 资料
        const auditorIds = [...new Set(pd.map((c: any) => c.auditor_id).filter(Boolean))];
        const { data: auditorProfiles } = auditorIds.length > 0
          ? await supabase.from('profiles').select('id, full_name, username').in('id', auditorIds)
          : { data: [] };

        const profileMap = new Map((auditorProfiles || []).map((p: any) => [p.id, p]));

        pendingList = pd.map((c: any) => ({
          ...c,
          auditor_profile: c.auditor_id ? profileMap.get(c.auditor_id) ?? null : null,
        }));
      }
    }

    setStats({
      certs: certCount || 0,
      validCerts: validCount || 0,
      pendingComplaints: complaintCount || 0,
      pendingCerts: pendingCount,
    });
    if (recent) setRecentComplaints(recent);
    setPendingCerts(pendingList);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    (async () => {
      const info = await fetchUserRole();
      await loadDashboard(info?.role);
    })();
  }, [fetchUserRole, loadDashboard]);

  const handleApprove = async (cert: PendingCert) => {
    if (!window.confirm(`确定审核通过并核发「${cert.dealers?.company_name}」的授权书吗？\n系统将自动为经销商创建登录账户。`)) return;
    setProcessingId(cert.id);
    try {
      const response = await fetch('/api/certificates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'approve_issue', certId: cert.id, managerId: userId }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      alert(`✅ 核发成功！\n授权书已签发，经销商账户已开通。`);
      await loadDashboard(userRole ?? undefined);
    } catch (err: any) {
      alert("核发失败：" + err.message);
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
        body: JSON.stringify({ action: 'reject_pending', certId: cert.id, managerId: userId }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      await loadDashboard(userRole ?? undefined);
    } catch (err: any) {
      alert("退回操作失败：" + err.message);
    } finally {
      setRejectingId(null);
    }
  };

  const isAdmin = userRole === 'SUPER_ADMIN' || userRole === 'MANAGER' || userRole === 'PROJECT_MANAGER';

  return (
    <div className="px-6 md:px-10 py-8 md:pt-10 md:pb-12 w-full max-w-7xl mx-auto flex flex-col flex-1 min-h-0 gap-8">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-1"
      >
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">工作台首页</h1>
        <p className="text-slate-500 text-[13px]">欢迎来到 NIHPLOD 品牌授权核查系统的管理大盘。</p>
      </motion.div>

      {/* 统计卡片 */}
      <div className={`grid grid-cols-1 gap-6 ${isAdmin ? 'md:grid-cols-4' : 'md:grid-cols-3'}`}>
        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.05 }}
          className="notion-card flex items-center justify-between transition-all"
        >
          <div>
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-3">累计核发证书</h3>
            <p className="text-3xl font-bold text-slate-900 tracking-tight">{isLoading ? '-' : stats.certs}</p>
          </div>
          <div className="w-12 h-12 rounded-full bg-slate-50 flex items-center justify-center text-slate-300">
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
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-3">当前有效授权</h3>
            <p className="text-3xl font-bold text-emerald-600 tracking-tight">{isLoading ? '-' : stats.validCerts}</p>
          </div>
          <div className="w-12 h-12 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-500">
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
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-3">待审投诉工单</h3>
            <p className="text-3xl font-bold text-red-600 tracking-tight">{isLoading ? '-' : stats.pendingComplaints}</p>
          </div>
          <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center text-red-300">
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
              <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-3">待我核发授权</h3>
              <p className={`text-3xl font-bold tracking-tight ${stats.pendingCerts > 0 ? 'text-amber-600' : 'text-slate-900'}`}>
                {isLoading ? '-' : stats.pendingCerts}
              </p>
            </div>
            <div className={`w-12 h-12 rounded-full flex items-center justify-center ${stats.pendingCerts > 0 ? 'bg-amber-50 text-amber-500' : 'bg-slate-50 text-slate-300'}`}>
              <AlertCircle className="w-6 h-6" />
            </div>
          </motion.div>
        )}
      </div>

      {/* 待核发审批面板（仅管理员可见） */}
      <AnimatePresence>
        {isAdmin && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ delay: 0.15 }}
            className="notion-card flex flex-col p-0 overflow-hidden"
          >
            <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-white">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center">
                  <ShieldCheck className="w-4 h-4 text-amber-600" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-800">审核员提交 · 待核发授权</h3>
                  <p className="text-[11px] text-slate-400 mt-0.5">以下申请由审核员初审提报，等待您的最终核发批准</p>
                </div>
              </div>
              {!isLoading && stats.pendingCerts > 0 && (
                <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-2.5 py-1 rounded-full tracking-wider">
                  {stats.pendingCerts} 项待处理
                </span>
              )}
              <Link
                href="/workbench/certificates"
                className="ml-4 text-[11px] font-bold text-slate-400 hover:text-slate-700 transition-colors uppercase tracking-widest flex items-center gap-1"
              >
                全部 <ChevronRight className="w-3 h-3" />
              </Link>
            </div>

            <div className="bg-slate-50/30 p-3 min-h-[120px] relative">
              {isLoading ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-slate-300 pointer-events-none">
                  <div className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-slate-200 animate-pulse" />
                    <div className="w-1.5 h-1.5 rounded-full bg-slate-300 animate-pulse delay-75" />
                    <div className="w-1.5 h-1.5 rounded-full bg-slate-200 animate-pulse delay-150" />
                  </div>
                  <span className="text-[12px] font-medium tracking-widest uppercase">同步申请队列...</span>
                </div>
              ) : pendingCerts.length === 0 ? (
                <div className="py-10 flex flex-col items-center justify-center gap-2 text-slate-400">
                  <CheckCircle2 className="w-8 h-8 text-emerald-200" />
                  <p className="text-[13px] font-semibold text-slate-500">审核队列已清空</p>
                  <p className="text-xs text-slate-400">目前没有等待核发的授权申请。</p>
                </div>
              ) : (
                <div className="space-y-2">
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
                          className={`bg-white rounded-xl border transition-all flex items-center gap-4 px-5 py-4 ${isBusy ? 'border-slate-100 opacity-70' : 'border-slate-100 hover:border-amber-100 hover:shadow-sm'}`}
                        >
                          {/* 序号标 */}
                          <div className="w-8 h-8 rounded-lg bg-amber-50 flex-shrink-0 flex items-center justify-center">
                            <span className="text-[11px] font-black text-amber-600 font-mono">{cert.cert_number.slice(-4)}</span>
                          </div>

                          {/* 主信息 */}
                          <div className="flex-1 min-w-0 grid grid-cols-3 gap-x-4 items-center">
                            <div className="min-w-0">
                              <p className="text-[13px] font-bold text-slate-900 truncate">{cert.dealers?.company_name || '未知经销商'}</p>
                              <p className="text-[11px] text-slate-400 font-mono mt-0.5 truncate">{platformId}</p>
                            </div>
                            <div className="flex items-center gap-1.5 text-slate-400">
                              <Calendar className="w-3 h-3 flex-shrink-0" />
                              <span className="text-[11px] tabular-nums">
                                {cert.start_date.replace(/-/g, '.')} – {cert.end_date.replace(/-/g, '.')}
                              </span>
                            </div>
                            <div className="flex items-center gap-1.5 text-slate-400">
                              <User className="w-3 h-3 flex-shrink-0" />
                              <span className="text-[11px] truncate">
                                由 <span className="font-semibold text-slate-600">
                                  {cert.auditor_profile?.full_name || cert.auditor_profile?.username || '审核员'}
                                </span> 提报
                              </span>
                            </div>
                          </div>

                          {/* 操作按钮 */}
                          <div className="flex items-center gap-3 flex-shrink-0">
                            <button
                              onClick={() => handleReject(cert)}
                              disabled={isBusy}
                              className="inline-flex items-center gap-1.5 text-[11px] font-bold text-slate-400 hover:text-rose-600 transition-colors disabled:opacity-40 disabled:pointer-events-none"
                            >
                              {isRejecting ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <XCircle className="w-3.5 h-3.5" />
                              )}
                              退回
                            </button>
                            <button
                              onClick={() => handleApprove(cert)}
                              disabled={isBusy}
                              className="inline-flex items-center gap-1.5 text-[11px] font-bold text-white bg-blue-600 hover:bg-blue-700 active:scale-95 transition-all px-3.5 py-1.5 rounded-lg shadow-sm shadow-blue-100 disabled:opacity-40 disabled:pointer-events-none"
                            >
                              {isApproving ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <ShieldCheck className="w-3.5 h-3.5" />
                              )}
                              核发授权
                            </button>
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
      </AnimatePresence>

      {/* 最新待处理举报 */}
      <div className="flex-1 notion-card flex flex-col p-0 overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-white">
          <h3 className="text-sm font-bold text-slate-800">最新待处理举报</h3>
          <Link href="/workbench/complaints" className="text-[11px] font-bold text-slate-500 hover:text-slate-900 transition-colors uppercase tracking-widest">
            进入处理中心 →
          </Link>
        </div>
        <div className="flex-1 min-h-0 overflow-auto bg-slate-50/30 p-2 relative">
          {isLoading ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-slate-300 pointer-events-none">
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-slate-200 animate-pulse" />
                <div className="w-1.5 h-1.5 rounded-full bg-slate-300 animate-pulse delay-75" />
                <div className="w-1.5 h-1.5 rounded-full bg-slate-200 animate-pulse delay-150" />
              </div>
              <span className="text-[12px] font-medium tracking-widest uppercase">拉取最新业务档案...</span>
            </div>
          ) : recentComplaints.length === 0 ? (
            <div className="p-8 text-center flex flex-col items-center justify-center h-full">
              <div className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center text-slate-400 mb-3">
                <Clock className="w-5 h-5" />
              </div>
              <p className="text-sm font-semibold text-slate-600">一切井然有序</p>
              <p className="text-xs text-slate-400 mt-1">目前没有任何积压的待处理工单。</p>
            </div>
          ) : (
            <div className="space-y-2">
              {recentComplaints.map(complaint => (
                <div key={complaint.id} className="bg-white p-4 rounded-xl border border-slate-100 flex items-center justify-between hover:shadow-sm transition-shadow">
                  <div>
                    <div className="flex items-center gap-3 mb-1.5">
                      <span className="text-[10px] font-mono text-slate-400 bg-slate-50 px-2 py-0.5 rounded">{complaint.id.split('-')[0]}</span>
                      <span className="text-xs font-bold text-slate-900">{complaint.channel}</span>
                    </div>
                    <p className="text-[13px] text-slate-500 line-clamp-1">{complaint.description}</p>
                  </div>
                  <Link href={`/workbench/complaints?id=${complaint.id}`} className="shrink-0 p-2 text-slate-300 hover:text-slate-900 hover:bg-slate-50 rounded-lg transition-colors">
                    <ExternalLink className="w-4 h-4" />
                  </Link>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  ScrollText, Search, ChevronLeft, ChevronRight, Loader2, ShieldCheck, Megaphone, FileImage
} from "lucide-react";
import { useToast } from "@/hooks/useToast";
import { useDebounce } from "@/hooks/useDebounce";
import { fetchWithTimeout } from "@/lib/fetch";

interface AuditLog {
  id: string;
  certificate_id?: string | null;
  certificate_ref?: string | null;
  complaint_id?: string | null;
  complaint_ref?: string | null;
  actor_id?: string | null;
  actor_role?: string | null;
  actor_name?: string | null;
  actor_name_snapshot?: string | null;
  action: string;
  comment?: string | null;
  reason?: string | null;
  target_type?: string | null;
  target_id?: string | null;
  target_ref?: string | null;
  request_id?: string | null;
  ip?: string | null;
  user_agent?: string | null;
  before?: unknown;
  after?: unknown;
  event_hash?: string | null;
  created_at: string;
  actor_username?: string | null;
  cert_number?: string | null;
}

const ACTION_LABELS: Record<string, string> = {
  CREATE_CERTIFICATE_PENDING: "提报授权",
  ISSUE_CERTIFICATE: "核发证书",
  REVOKE_CERTIFICATE: "吊销证书",
  REJECT_CERTIFICATE: "退回申请",
  UPDATE_CERTIFICATE: "更新证书",
  DELETE_CERTIFICATE: "移除证书（软删除）",
  DELETE_COMPLAINT: "移除工单（软删除）",
  DELETED: "删除工单",
  SUBMIT_COMPLAINT: "提交投诉",
  CREATE_ADMIN: "创建管理员",
  BAN_USER: "封禁账号",
  UNBAN_USER: "解封账号",
  DELETE_USER: "移除管理员",
  RESET_PASSWORD: "重置密码",
  UPDATE_USER_ROLE: "修改角色",
  CHANGE_PASSWORD: "修改密码",
  LOGIN_SUCCESS: "登录成功",
  LOGIN_FAILED: "登录失败",
  LOGIN_BLOCKED: "登录被拒",
  LOGOUT: "退出登录",
  UPLOAD_FILE: "上传文件",
  UPLOAD_PUBLIC_FILE: "匿名上传文件",
  CRON_EXPIRE_CERTIFICATES: "自动过期证书",
};

const COMPLAINT_STATUS_LABELS: Record<string, string> = {
  PENDING: "待处理",
  INVESTIGATING: "调查中",
  RESOLVED: "已解决",
  REJECTED: "无效驳回",
};

function formatAction(action: string): string {
  const match = action.match(/^STATUS_CHANGE:(.+)->(.+)$/);
  if (match) {
    const from = COMPLAINT_STATUS_LABELS[match[1]] || match[1];
    const to = COMPLAINT_STATUS_LABELS[match[2]] || match[2];
    return `工单状态：${from} → ${to}`;
  }
  return ACTION_LABELS[action] || action;
}

const CATEGORY_TABS = [
  { key: "", label: "全部日志" },
  { key: "certificate", label: "证书操作" },
  { key: "complaint", label: "投诉处理" },
  { key: "account", label: "账号管理" },
  { key: "auth", label: "登录/口令" },
  { key: "file", label: "文件" },
  { key: "system", label: "系统" },
];

export default function AuditLogsPage() {
  const { toast } = useToast();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [category, setCategory] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const [total, setTotal] = useState(0);

  const debouncedSearch = useDebounce(searchQuery, 300);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, category]);

  useEffect(() => {
    (async () => {
      try {
        const meRes = await fetchWithTimeout('/api/auth/me');
        if (!meRes.ok) {
          window.location.href = "/";
          return;
        }
        const meData = await meRes.json();
        if (meData?.user?.role !== 'SUPER_ADMIN') {
          window.location.href = "/workbench";
        }
      } catch {
        window.location.href = "/";
      }
    })();
  }, []);

  useEffect(() => {
    fetchLogs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, category, debouncedSearch]);

  const fetchLogs = async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
      });
      if (category) params.set('category', category);
      if (debouncedSearch.trim()) params.set('q', debouncedSearch.trim());

      const res = await fetchWithTimeout(`/api/db/audit-logs?${params.toString()}`);
      if (res.ok) {
        const result = await res.json();
        setLogs(result.data || []);
        setTotal(result.total || 0);
      } else if (res.status === 403) {
        toast({ message: '无权访问，仅超级管理员可查看操作日志', type: 'error' });
      } else {
        console.error('Failed to fetch audit logs:', res.status);
      }
    } catch (err) {
      console.error('Error fetching audit logs:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const getCategoryBadge = (log: AuditLog) => {
    if (log.action.startsWith('LOGIN') || log.action === 'LOGOUT' || log.action === 'CHANGE_PASSWORD') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-cyan-50 text-cyan-700 text-[11px] font-semibold tracking-wide whitespace-nowrap">
          <ShieldCheck className="w-3 h-3" /> 登录/口令
        </span>
      );
    }
    if (log.target_type === 'profile' || log.action === 'CREATE_ADMIN') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-violet-50 text-violet-700 text-[11px] font-semibold tracking-wide whitespace-nowrap">
          <ShieldCheck className="w-3 h-3" /> 账号管理
        </span>
      );
    }
    if (log.target_type === 'file' || log.action.startsWith('UPLOAD')) {
      return (
        <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-emerald-50 text-emerald-700 text-[11px] font-semibold tracking-wide whitespace-nowrap">
          <FileImage className="w-3 h-3" /> 文件
        </span>
      );
    }
    if (log.target_type === 'system' || log.action.startsWith('CRON_')) {
      return (
        <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-slate-100 text-slate-600 text-[11px] font-semibold tracking-wide whitespace-nowrap">
          系统
        </span>
      );
    }
    if (log.certificate_id || log.certificate_ref) {
      return (
        <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-blue-50 text-blue-700 text-[11px] font-semibold tracking-wide whitespace-nowrap">
          <ShieldCheck className="w-3 h-3" /> 证书操作
        </span>
      );
    }
    if (log.complaint_id || log.complaint_ref) {
      return (
        <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-amber-50 text-amber-700 text-[11px] font-semibold tracking-wide whitespace-nowrap">
          <Megaphone className="w-3 h-3" /> 投诉处理
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-slate-100 text-slate-600 text-[11px] font-semibold tracking-wide whitespace-nowrap">
        系统
      </span>
    );
  };

  const getTarget = (log: AuditLog) => {
    if (log.cert_number) {
      return <span className="font-mono text-[11px] text-slate-500 tracking-tight">{log.cert_number}</span>;
    }
    if (log.certificate_ref) {
      return <span className="font-mono text-[11px] text-slate-500 tracking-tight">{log.certificate_ref.split('-')[0]}…</span>;
    }
    if (log.complaint_ref || log.complaint_id) {
      const ref = log.complaint_ref || log.complaint_id || '';
      return (
        <span className="font-mono text-[11px] text-slate-500 tracking-tight">
          {ref.split('-')[0]}…
          {!log.complaint_id && <span className="ml-1 text-slate-400">(工单已移除)</span>}
        </span>
      );
    }
    if (log.target_ref) {
      return <span className="font-mono text-[11px] text-slate-500 tracking-tight break-all">{log.target_ref}</span>;
    }
    if (log.target_id) {
      return <span className="font-mono text-[11px] text-slate-500 tracking-tight">{log.target_id.split('-')[0]}…</span>;
    }
    return <span className="text-slate-300 text-xs">-</span>;
  };

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="px-8 md:px-12 py-8 md:pt-10 md:pb-12 w-full max-w-7xl mx-auto flex flex-col flex-1 min-h-0">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-8">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-1">
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-3">
            <ScrollText className="w-7 h-7 text-slate-900" />
            系统操作日志
          </h1>
          <p className="text-slate-500 text-[13px]">全局审计追踪：证书核发/吊销/修改与投诉工单流转记录，已删除工单的操作留痕同样保留。</p>
        </motion.div>
      </div>

      <div className="flex-1 min-h-0 overflow-hidden flex flex-col p-0">
        <div className="px-0 py-6 border-b border-slate-100/50 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-transparent">
          <div className="flex items-center gap-6 text-slate-500 font-semibold text-[13px] ml-2">
            {CATEGORY_TABS.map((tab) => (
              <span
                key={tab.key || 'all'}
                onClick={() => setCategory(tab.key)}
                className={`${category === tab.key ? "text-slate-900 border-b-2 border-slate-900 pb-1" : "hover:text-slate-900 transition-colors"} cursor-pointer`}
              >
                {tab.label}
              </span>
            ))}
          </div>
          <div className="relative w-full max-w-sm">
            <Search className="w-4 h-4 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="搜索操作人、编号、备注..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-50/50 border border-slate-100/50 rounded-xl pl-11 pr-5 py-2.5 text-[13px] outline-none focus:bg-white focus:border-slate-300 transition-all text-slate-900 placeholder:text-slate-400"
            />
          </div>
        </div>

        <div className="overflow-auto flex-1 min-h-0 relative">
          {isLoading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-slate-300 z-30 pointer-events-none">
              <Loader2 className="w-6 h-6 animate-spin text-slate-200" />
              <span className="text-[12px] font-medium tracking-widest uppercase">同步审计链路...</span>
            </div>
          )}
          <table className="w-full text-left text-[13px] whitespace-nowrap table-auto border-separate border-spacing-0">
            <thead className="text-slate-500 font-semibold uppercase tracking-wider text-xs bg-slate-50/80">
              <tr>
                <th className="px-6 py-4 border-b border-slate-50/0 sticky top-0 bg-slate-50/80 z-20 backdrop-blur-md">时间</th>
                <th className="px-6 py-4 border-b border-slate-50/0 sticky top-0 bg-slate-50/80 z-20 backdrop-blur-md">操作人</th>
                <th className="px-6 py-4 border-b border-slate-50/0 sticky top-0 bg-slate-50/80 z-20 backdrop-blur-md">类型</th>
                <th className="px-6 py-4 border-b border-slate-50/0 sticky top-0 bg-slate-50/80 z-20 backdrop-blur-md">操作</th>
                <th className="px-6 py-4 border-b border-slate-50/0 sticky top-0 bg-slate-50/80 z-20 backdrop-blur-md">对象</th>
                <th className="px-6 py-4 border-b border-slate-50/0 sticky top-0 bg-slate-50/80 z-20 backdrop-blur-md">备注</th>
                <th className="px-6 py-4 border-b border-slate-50/0 sticky top-0 bg-slate-50/80 z-20 backdrop-blur-md">详情</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 text-slate-700 font-medium">
              {!isLoading && logs.map((log) => (
                <tr key={log.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-6 py-4 text-xs tabular-nums text-slate-500">
                    {log.created_at ? new Date(log.created_at).toLocaleString() : '-'}
                  </td>
                  <td className="px-6 py-4">
                    <span className="font-bold text-slate-900">
                      {log.actor_name_snapshot || log.actor_name || log.actor_username || '系统'}
                    </span>
                    {log.actor_role && <span className="ml-1 text-[10px] text-slate-400">{log.actor_role}</span>}
                  </td>
                  <td className="px-6 py-4">{getCategoryBadge(log)}</td>
                  <td className="px-6 py-4 text-slate-800">{formatAction(log.action)}</td>
                  <td className="px-6 py-4">{getTarget(log)}</td>
                    <td className="px-6 py-4 text-slate-500 max-w-[260px] truncate" title={log.comment || log.reason || ''}>
                      {log.comment || log.reason || '-'}
                    </td>
                    <td className="px-6 py-4 text-slate-500">
                      {(log.before || log.after || log.reason || log.request_id) ? (
                        <details className="text-[11px]">
                          <summary className="cursor-pointer text-slate-400 hover:text-slate-600">查看</summary>
                          <pre className="mt-1 max-h-40 max-w-[360px] overflow-auto whitespace-pre-wrap break-all rounded bg-slate-50 p-2 text-[10px] text-slate-500">
                            {JSON.stringify({
                              before: log.before,
                              after: log.after,
                              reason: log.reason,
                              request_id: log.request_id,
                              ip: log.ip,
                            }, null, 2)}
                          </pre>
                        </details>
                      ) : '-'}
                    </td>
                  </tr>
              ))}
            </tbody>
          </table>

          {!isLoading && logs.length === 0 && (
            <div className="absolute inset-0 top-12 flex flex-col items-center justify-center gap-3 text-slate-400 pointer-events-none">
              <div className="w-12 h-12 bg-slate-50 rounded-full flex items-center justify-center text-slate-200">
                <ScrollText className="w-6 h-6" />
              </div>
              <span className="text-[13px] font-medium tracking-tight">暂无匹配的操作日志</span>
            </div>
          )}
        </div>

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
    </div>
  );
}

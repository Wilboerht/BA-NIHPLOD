"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search, Key, FileText, ShieldCheck, XCircle, RefreshCw,
  Building2, Ban, ShieldOff, Loader2
} from "lucide-react";
import CertificateGenerator from "@/components/certificate/CertificateGenerator";
import { supabase } from "@/lib/supabase";

interface Dealer {
  id: string;
  company_name: string;
  phone: string;
  email: string;
  created_at: string;
  certificates: { count: number }[];
  profile?: {
    id: string;
    username: string;
    full_name: string;
    role: string;
    is_first_login: boolean;
  };
  isBanned?: boolean;
}

export default function DealersPage() {
  const [dealers, setDealers] = useState<Dealer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [userRole, setUserRole] = useState<string | null>(null);
  const [selectedDealer, setSelectedDealer] = useState<Dealer | null>(null);
  const [dealerCerts, setDealerCerts] = useState<any[]>([]);
  const [dealerNameMap, setDealerNameMap] = useState<Record<string, string>>({}); // dealer_id -> company_name
  const [dealerPhoneMap, setDealerPhoneMap] = useState<Record<string, string>>({}); // dealer_id -> phone
  const [isCertsLoading, setIsCertsLoading] = useState(false);
  const [viewCertData, setViewCertData] = useState<any>(null);
  const [isViewVoided, setIsViewVoided] = useState(false);
  const [banningId, setBanningId] = useState<string | null>(null); // 正在执行 API 的 dealer.id
  const [confirmBanId, setConfirmBanId] = useState<string | null>(null); // 待二次确认的 dealer.id

  const fetchUserRole = useCallback(async () => {
    try {
      await new Promise(r => setTimeout(r, 150));
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
        setUserRole(profile?.role ?? null);
      }
    } catch {
      console.warn("Auth sync recovered");
    }
  }, []);

  const fetchData = useCallback(async () => {
    setIsLoading(true);

    const { data, error } = await supabase
      .from('dealers')
      .select('*, certificates(count)')
      .order('created_at', { ascending: false });

    if (!error && data) {
      const dealerNames = data.map(d => d.company_name);
      const { data: profiles } = await supabase
        .from('profiles')
        .select('*')
        .in('full_name', dealerNames)
        .eq('role', 'DEALER');

      // 批量查询封禁状态（仅有 profile 即有 auth 账号的经销商才需要）
      const profilesWithId = (profiles || []).filter(p => p.id);
      let bannedSet = new Set<string>(); // 存放 profile.id（= auth user_id）

      if (profilesWithId.length > 0) {
        // 并发查询各账户的封禁状态
        const banResults = await Promise.allSettled(
          profilesWithId.map(p =>
            fetch(`/api/admin/ban-user?userId=${p.id}`).then(r => r.json()).then(j => ({ id: p.id, isBanned: j.isBanned }))
          )
        );
        banResults.forEach(res => {
          if (res.status === 'fulfilled' && res.value.isBanned) {
            bannedSet.add(res.value.id);
          }
        });
      }

      const enriched: Dealer[] = data.map(d => {
        const profile = profiles?.find(p => p.full_name === d.company_name);
        return {
          ...d,
          profile,
          isBanned: profile ? bannedSet.has(profile.id) : false,
        };
      });

      setDealers(enriched);
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    fetchUserRole();
    fetchData();
  }, [fetchUserRole, fetchData]);

  const filteredDealers = dealers.filter(d =>
    d.company_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (d.phone || "").toLowerCase().includes(searchQuery.toLowerCase())
  );

  // 按 phone 分组，合并同 phone 的 dealers
  const groupedByPhone = useCallback(() => {
    const phoneMap = new Map<string, Dealer[]>();
    
    filteredDealers.forEach(dealer => {
      const phone = dealer.phone || 'unknown';
      if (!phoneMap.has(phone)) {
        phoneMap.set(phone, []);
      }
      phoneMap.get(phone)!.push(dealer);
    });

    return Array.from(phoneMap.values()).map(dealerGroup => {
      const allDealer = dealerGroup[0]; // 用第一个作为代表
      const allNames = [...new Set(dealerGroup.map(d => d.company_name))]; // 去重
      const allDealerIds = dealerGroup.map(d => d.id);
      const totalCerts = dealerGroup.reduce((sum, d) => sum + (d.certificates?.[0]?.count || 0), 0);
      
      return {
        ...allDealer,
        allNames,
        allDealerIds,
        totalCerts
      };
    });
  }, [filteredDealers]);

  const resetDealerPassword = async (username: string) => {
    if (!username) return;
    if (!window.confirm(`确定要重置经销商账号 [${username}] 的密码吗？\n重置后密码将恢复为该账号名称。`)) return;
    alert("重置指令已发送（当前建议通过管理员 API 实现）");
  };

  // 第一次点击：进入待确认状态
  const triggerBanConfirm = (dealerGroup: any) => {
    if (!dealerGroup.profile?.id) return;
    setConfirmBanId(dealerGroup.phone);
  };

  // 第二次点击：执行封禁/解封 (应用于该 phone 的所有 dealer)
  const executeBan = async (dealerGroup: any) => {
    if (!dealerGroup.profile?.id) return;
    const action = dealerGroup.isBanned ? "unban" : "ban";
    setConfirmBanId(null);
    setBanningId(dealerGroup.phone);
    try {
      // 只需 ban 该 phone 对应的 profile 一次（因为一个 phone 只有一个 profile）
      const res = await fetch('/api/admin/ban-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: dealerGroup.profile.id, action }),
      });
      
      if (!res.ok) {
        const result = await res.json();
        throw new Error(result.error || '操作失败');
      }

      // 乐观更新本地状态：该 phone 下的所有 dealer 都更新
      setDealers(prev => prev.map(d =>
        dealerGroup.allDealerIds.includes(d.id) ? { ...d, isBanned: action === 'ban' } : d
      ));
    } catch (err: any) {
      alert("操作失败：" + (err.message || "未知错误"));
    } finally {
      setBanningId(null);
    }
  };

  return (
    <div className="px-8 md:px-12 py-8 md:pt-10 md:pb-12 w-full max-w-7xl mx-auto flex flex-col flex-1 min-h-0">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-8">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-1">
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-3">
            <Building2 className="w-7 h-7 text-slate-900" />
            经销商管理
          </h1>
          <p className="text-slate-500 text-[13px]">查看并管理所有已授权经销商的系统登录权限、资料完整度及证书活跃状态。</p>
        </motion.div>
      </div>

      <div className="flex-1 min-h-0 overflow-hidden flex flex-col p-0">
        <div className="px-0 py-6 flex justify-between items-center bg-transparent border-b border-slate-100/50">
          <div className="relative w-full max-w-sm ml-2">
            <Search className="w-4 h-4 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="搜索经销商名称、登录账号..."
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
              <span className="text-[12px] font-medium tracking-widest uppercase">拉取经销商档案...</span>
            </div>
          )}
          <table className="w-full text-left text-sm whitespace-nowrap table-auto border-separate border-spacing-0">
            <thead className="text-slate-500 font-semibold uppercase tracking-wider text-xs bg-slate-50/80">
              <tr>
                <th className="px-6 py-4 border-b border-slate-100 sticky top-0 bg-slate-50/80 z-20 backdrop-blur-md">经销商主体（名称）</th>
                <th className="px-6 py-4 border-b border-slate-100 sticky top-0 bg-slate-50/80 z-20 backdrop-blur-md">ID</th>
                <th className="px-6 py-4 border-b border-slate-100 sticky top-0 bg-slate-50/80 z-20 backdrop-blur-md">登录账号 (Phone)</th>
                <th className="px-6 py-4 border-b border-slate-100 sticky top-0 bg-slate-50/80 z-20 backdrop-blur-md">持有证书</th>
                <th className="px-6 py-4 border-b border-slate-100 sticky top-0 bg-slate-50/80 z-20 backdrop-blur-md">注册时间</th>
                <th className="px-6 py-4 border-b border-slate-100 sticky top-0 bg-slate-50/80 z-20 backdrop-blur-md">账户状态</th>
                <th className="px-6 py-4 border-b border-slate-100 text-right sticky top-0 bg-slate-50/80 z-20 backdrop-blur-md">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 text-slate-700 font-medium">
              {!isLoading && groupedByPhone().map((dealerGroup) => (
                <tr key={dealerGroup.phone} className={`hover:bg-slate-50/50 transition-colors group ${dealerGroup.isBanned ? 'bg-rose-50/30' : ''}`}>
                  <td className="px-6 py-4 mr-10">
                    <div className="flex flex-col">
                      <div className={`space-y-0.5 ${dealerGroup.isBanned ? 'text-slate-400 line-through decoration-rose-300' : 'text-slate-900'}`}>
                        {dealerGroup.allNames.map((name, idx) => (
                          <div key={idx} className="text-[12px]">{name}</div>
                        ))}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-[11px] text-slate-500 font-mono">
                      {dealerGroup.allDealerIds[0].substring(0, 8).toUpperCase()}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-col">
                      <span className="text-[13px] text-slate-600 font-mono uppercase">
                        {dealerGroup.phone || "-"}
                      </span>
                      {dealerGroup.profile?.is_first_login && (
                        <span className="text-[10px] text-amber-500 font-bold uppercase tracking-tighter">
                          未修改初始密码
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[11px] font-bold">
                      {dealerGroup.totalCerts} 张
                    </span>
                  </td>
                  <td className="px-6 py-4 text-xs text-slate-500">
                    {new Date(dealerGroup.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4">
                    {!dealerGroup.profile ? (
                      <span className="inline-flex items-center gap-1 text-slate-300 text-[11px] font-bold uppercase tracking-wider">
                        待开启
                      </span>
                    ) : dealerGroup.isBanned ? (
                      <span className="inline-flex items-center gap-1.5 text-rose-500 text-[11px] font-bold uppercase tracking-wider">
                        <Ban className="w-3 h-3" /> 已封禁
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-emerald-600 text-[11px] font-bold uppercase tracking-wider">
                        <ShieldCheck className="w-3 h-3" /> 已激活
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <AnimatePresence mode="wait" initial={false}>
                      {confirmBanId === dealerGroup.phone ? (
                        /* ── 二次确认条 ── */
                        <motion.div
                          key="confirm"
                          initial={{ opacity: 0, scale: 0.95, x: 8 }}
                          animate={{ opacity: 1, scale: 1, x: 0 }}
                          exit={{ opacity: 0, scale: 0.95, x: 8 }}
                          transition={{ duration: 0.15 }}
                          className="flex items-center justify-end gap-2"
                        >
                          <span className={`text-[11px] font-bold tracking-wide ${
                            dealerGroup.isBanned ? 'text-emerald-600' : 'text-rose-500'
                          }`}>
                            {dealerGroup.isBanned ? '确认解封？' : '确认封禁？'}
                          </span>
                          <button
                            onClick={() => setConfirmBanId(null)}
                            className="px-2.5 py-1 text-[11px] font-bold text-slate-400 hover:text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md transition-all"
                          >
                            取消
                          </button>
                          <button
                            onClick={() => executeBan(dealerGroup)}
                            className={`px-3 py-1 text-[11px] font-bold text-white rounded-md transition-all active:scale-95 ${
                              dealerGroup.isBanned
                                ? 'bg-emerald-500 hover:bg-emerald-600 shadow-sm shadow-emerald-100'
                                : 'bg-rose-500 hover:bg-rose-600 shadow-sm shadow-rose-100'
                            }`}
                          >
                            {dealerGroup.isBanned ? '解封' : '封禁'}
                          </button>
                        </motion.div>
                      ) : (
                        /* ── 常态操作按钮组 ── */
                        <motion.div
                          key="actions"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          transition={{ duration: 0.1 }}
                          className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                      {/* 重置密码 */}
                      {dealerGroup.profile && userRole === 'SUPER_ADMIN' && (
                        <button
                          onClick={() => resetDealerPassword(dealerGroup.profile!.username)}
                          title="重置初始密码"
                          className="p-1.5 hover:bg-slate-100 rounded-md text-slate-400 hover:text-slate-600 transition-all"
                        >
                          <Key className="w-4 h-4" />
                        </button>
                      )}

                      {/* 封禁 / 解封 */}
                      {dealerGroup.profile && userRole === 'SUPER_ADMIN' && (
                        dealerGroup.isBanned ? (
                          /* 已封禁 → 显示绿色"解封"胶囊 */
                          <button
                            onClick={() => triggerBanConfirm(dealerGroup)}
                            disabled={banningId === dealerGroup.phone}
                            title="解除封禁"
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-bold bg-emerald-50 text-emerald-600 hover:bg-emerald-100 hover:text-emerald-700 transition-all disabled:opacity-40 disabled:pointer-events-none"
                          >
                            {banningId === dealerGroup.phone ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <ShieldCheck className="w-3.5 h-3.5" />
                            )}
                            解封
                          </button>
                        ) : (
                          /* 正常账户 → 显示灰色"封禁"图标按钮，悬停变红 */
                          <button
                            onClick={() => triggerBanConfirm(dealerGroup)}
                            disabled={banningId === dealerGroup.phone}
                            title="封禁账户"
                            className="p-1.5 rounded-md text-slate-400 hover:bg-rose-50 hover:text-rose-500 transition-all disabled:opacity-40 disabled:pointer-events-none"
                          >
                            {banningId === dealerGroup.phone ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <ShieldOff className="w-4 h-4" />
                            )}
                          </button>
                        )
                      )}

                      {/* 查看证书 (显示该 phone 下所有 dealer 的证书) */}
                      <button
                        onClick={async () => {
                          setSelectedDealer(dealerGroup);
                          setIsCertsLoading(true);
                          // 查询该 phone 下所有 dealer 的证书
                          const { data } = await supabase
                            .from('certificates')
                            .select('*')
                            .in('dealer_id', dealerGroup.allDealerIds)
                            .order('created_at', { ascending: false });
                          setDealerCerts(data || []);
                          // 建立dealerId到dealerName和dealerPhone的映射
                          const nameMap: Record<string, string> = {};
                          const phoneMap: Record<string, string> = {};
                          dealerGroup.allDealerIds.forEach(id => {
                            const dealer = dealers.find(d => d.id === id);
                            if (dealer) {
                              nameMap[id] = dealer.company_name;
                              phoneMap[id] = dealer.phone || '';
                            }
                          });
                          setDealerNameMap(nameMap);
                          setDealerPhoneMap(phoneMap);
                          setIsCertsLoading(false);
                        }}
                        title="查看名下证书"
                        className="p-1.5 hover:bg-slate-100 rounded-md text-slate-400 hover:text-blue-500 transition-all"
                      >
                        <FileText className="w-4 h-4" />
                      </button>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {!isLoading && groupedByPhone().length === 0 && (
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
                  <p className="text-xs text-slate-500 font-medium">登录账号：{selectedDealer!.phone}</p>
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
                        <th className="px-6 py-4">主题名称</th>
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
                            <td className="px-6 py-4 text-[12px] text-slate-600">{dealerNameMap[cert.dealer_id] || '-'}</td>
                            <td className="px-6 py-4 text-[12px] text-slate-500">
                              {cert.start_date.replace(/-/g, '.')} - {cert.end_date.replace(/-/g, '.')}
                            </td>
                            <td className="px-6 py-4">
                              {isVoided ? (
                                <span className="text-rose-500 text-[10px] font-bold bg-rose-50 px-2 py-0.5 rounded">已作废</span>
                              ) : isExpiredByDate || cert.status === 'EXPIRED' ? (
                                <span className="text-slate-400 text-[10px] font-bold">已失效</span>
                              ) : cert.status === 'ISSUED' ? (
                                <span className="text-emerald-500 text-[10px] font-bold">生效中</span>
                              ) : (
                                <span className="text-amber-500 text-[10px] font-bold">待审核</span>
                              )}
                            </td>
                            <td className="px-6 py-4 text-right">
                              <button
                                onClick={() => {
                                  const scopeParts = cert.auth_scope?.split(' | ') || ["", ""];
                                  setViewCertData({
                                    platformId: scopeParts[0],
                                    platformLabel: "淘宝ID",
                                    shopName: dealerNameMap[cert.dealer_id] || '-',
                                    shopLabel: "店铺名称",
                                    scopeText: scopeParts[1] || "授权经销资格条款",
                                    duration: `${cert.start_date.replace(/-/g, '.')} - ${cert.end_date.replace(/-/g, '.')}`,
                                    authorizer: "旎柏（上海）商贸有限公司",
                                    sealImage: "/default-seal.svg",
                                    phone: dealerPhoneMap[cert.dealer_id] || ""
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

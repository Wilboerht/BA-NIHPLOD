"use client";

import { useState } from "react";
import { Search, ShieldAlert, Award, Download, Globe, RefreshCw, CheckCircle2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";

const MOCK_CERTIFICATES: Record<string, any> = {
  "BAVP-2024-001": {
    id: "BAVP-2024-001",
    dealerName: "上海宜家实业有限公司",
    duration: "2024.01.01 - 2025.12.31",
    scope: "华东区 / 全渠道销售",
    status: "ISSUED",
  },
};

export default function VerificationPage() {
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<any>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query) return;
    setIsSearching(true);
    setResult(null);
    setError(null);
    
    setTimeout(() => {
      const found = MOCK_CERTIFICATES[query.toUpperCase()];
      if (found) {
        setResult(found);
      } else {
        setError("未查询到相关授权信息，请核对编号后重试。");
      }
      setIsSearching(false);
    }, 1500);
  };

  return (
    <main className="relative min-h-screen flex flex-col items-center selection:bg-slate-200"
          style={{ background: "radial-gradient(circle at center, #fffdfa 0%, #f7efe6 100%)" }}>
      
      {/* 底部光晕装饰 */}
      <div className="absolute inset-0 pointer-events-none opacity-40" 
           style={{ background: "radial-gradient(circle at 50% 20%, rgba(139, 69, 19, 0.04) 0%, transparent 60%)" }} />

      {/* 顶部导航 - 纯净版 */}
      <nav className="w-full max-w-7xl px-8 py-10 flex justify-between items-center z-20">
         <div className="flex items-center gap-4 transition-all hover:opacity-80">
            <img src="/NIHPLOD-logo.svg" alt="NIHPLOD" className="h-9 w-auto" />
            <div className="w-px h-6 bg-slate-300/40 mx-1" />
            <span className="text-base font-bold tracking-tight text-slate-800">授权验证系统</span>
         </div>
      </nav>

      {/* 核心内容区 */}
      <div className="flex-1 flex flex-col items-center justify-center w-full max-w-4xl px-8 relative z-10 -mt-16">
        <motion.div 
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          className="text-center space-y-8 mb-14"
        >
          <div className="inline-flex items-center gap-2.5 px-4 py-1.5 bg-white/60 border border-white/80 rounded-full shadow-sm backdrop-blur-sm">
            <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
            <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400 leading-none">Official Registry · 数据库已同步</span>
          </div>
          <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight text-[#0f253e] leading-[1.1]">
            品牌授权验证中心
          </h1>
          <p className="text-slate-500 text-base md:text-lg max-w-xl mx-auto leading-relaxed font-bold">
            通过输入授权证书编号，实时核检经销商资质的真实性、<br className="hidden md:block" />合法性及其授权经营范围。
          </p>
        </motion.div>

        {/* 搜索框 */}
        <motion.div 
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          className="w-full max-w-2xl mb-12 group"
        >
          <form onSubmit={handleSearch} className="flex gap-4 p-2 bg-white/40 backdrop-blur-md rounded-[24px] border border-white/80 shadow-[0_32px_64px_-16px_rgba(0,0,0,0.06)] transition-all focus-within:shadow-[0_48px_80px_-16px_rgba(0,0,0,0.08)]">
            <div className="flex-1 relative flex items-center">
              <Search className="absolute left-6 w-5 h-5 text-slate-300" />
              <input 
                type="text" 
                placeholder="请输入证书编号 (如: BAVP-2024-001)" 
                className="w-full bg-transparent border-none outline-none pl-14 pr-6 py-5 text-slate-900 text-lg font-medium placeholder:text-slate-200 focus:ring-0 transition-all font-mono"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <button 
              disabled={isSearching}
              className="bg-[#0f253e] text-white font-bold px-10 rounded-[18px] hover:bg-slate-800 active:scale-[0.98] transition-all disabled:opacity-50 flex items-center gap-2 shadow-lg shadow-blue-900/10"
            >
              {isSearching ? <RefreshCw className="w-5 h-5 animate-spin" /> : "立即查询"}
            </button>
          </form>
        </motion.div>

        {/* 结果显示 */}
        <div className="w-full max-w-2xl min-h-[320px]">
          <AnimatePresence mode="wait">
            {isSearching && (
              <motion.div 
                key="loading" 
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="flex flex-col items-center pt-16 gap-6"
              >
                <div className="w-10 h-10 border-3 border-slate-200 border-t-[#0f253e] rounded-full animate-spin" />
                <span className="text-[11px] font-bold text-slate-300 uppercase tracking-[0.25em] ml-2">正在同步官方数据库...</span>
              </motion.div>
            )}

            {error && !isSearching && (
              <motion.div 
                initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                className="bg-red-50/60 backdrop-blur-sm border border-red-100 p-8 rounded-2xl flex items-start gap-5 text-red-600 shadow-[0_16px_32px_rgba(220,38,38,0.02)]"
              >
                <ShieldAlert className="w-6 h-6 shrink-0 mt-1" />
                <div className="space-y-1">
                   <p className="text-base font-bold">验证失败</p>
                   <p className="text-sm opacity-80 leading-relaxed">{error}</p>
                </div>
              </motion.div>
            )}

            {result && !isSearching && (
              <motion.div 
                initial={{ opacity: 0, scale: 0.98, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }}
                className="relative overflow-hidden group"
              >
                <div className="absolute -inset-0.5 bg-gradient-to-b from-white to-white/0 rounded-[26px] opacity-40 blur-sm" />
                <div className="relative bg-white/60 backdrop-blur-xl border border-white/80 p-10 md:p-12 rounded-[24px] shadow-[0_40px_80px_-24px_rgba(0,0,0,0.08)]">
                  <div className="flex flex-col md:flex-row justify-between items-start gap-10">
                    <div className="flex-1 space-y-8">
                      <div className="flex items-center gap-3 text-emerald-600 font-bold text-[11px] uppercase tracking-widest bg-emerald-50/80 px-4 py-1.5 rounded-full border border-emerald-100 w-fit">
                         <CheckCircle2 className="w-4 h-4" /> 官方资质核验通过
                      </div>
                      <div className="space-y-2">
                         <h2 className="text-3xl md:text-4xl font-extrabold text-[#0f253e] tracking-tight">{result.dealerName}</h2>
                         <p className="text-slate-400 text-xs font-bold font-mono tracking-widest uppercase">CERTIFICATE ID: {result.id}</p>
                      </div>
                      <div className="grid grid-cols-2 gap-10 pt-8 border-t border-slate-300/20">
                         <div className="space-y-1.5">
                            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest leading-none">有效期至</span>
                            <p className="text-lg font-bold text-[#0f253e] tracking-tight">{result.duration}</p>
                         </div>
                         <div className="space-y-1.5">
                            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest leading-none">授权区域</span>
                            <p className="text-lg font-bold text-[#0f253e] tracking-tight">{result.scope}</p>
                         </div>
                      </div>
                      <div className="pt-10 flex flex-wrap gap-4">
                        <button className="bg-[#0f253e] text-white font-bold h-12 px-8 rounded-xl text-xs flex items-center gap-2.5 hover:bg-slate-800 transition-all shadow-lg shadow-blue-900/10 active:scale-95 uppercase tracking-wide">
                          <Download className="w-4 h-4" /> 导出授权证书
                        </button>
                        <button className="bg-white/60 border border-slate-200 text-slate-600 font-bold h-12 px-8 rounded-xl text-xs flex items-center gap-2.5 hover:bg-white hover:border-slate-300 transition-all active:scale-95 uppercase tracking-wide">
                          <Globe className="w-4 h-4" /> 访问官方渠道
                        </button>
                      </div>
                    </div>
                    <div className="flex flex-col items-center gap-6 p-8 bg-slate-50/50 rounded-2xl border border-white/60">
                       <div className="w-28 h-28 bg-white border border-slate-100 rounded-xl shadow-inner flex items-center justify-center p-3">
                          <img src="/NIHPLOD-logo.svg" alt="SECURE" className="w-full h-auto opacity-10 grayscale" />
                       </div>
                       <div className="text-center space-y-1.5">
                          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Digital-Auth Verified</p>
                          <p className="text-[8px] text-slate-300 tracking-tighter">Powered by NIHLPOD-SECURE</p>
                       </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* 页脚 - 聚合版入口 */}
      <footer className="w-full max-w-7xl px-8 py-14 flex flex-col md:flex-row justify-between items-center gap-6 mt-auto border-t border-slate-200/20 text-slate-400">
         <p className="text-[11px] font-normal text-slate-300 tracking-normal antialiased">
           &copy; 2026 NIHPLOD. All rights reserved
         </p>
         <div className="flex gap-10 text-[11px] font-bold text-slate-400/60 uppercase tracking-[0.1em]">
            <Link href="/login" className="hover:text-slate-900 transition-colors">管理端登录</Link>
            <span className="hover:text-slate-900 cursor-pointer transition-colors">服务协议</span>
            <span className="hover:text-slate-900 cursor-pointer transition-colors">隐私声明</span>
         </div>
      </footer>
    </main>
  );
}

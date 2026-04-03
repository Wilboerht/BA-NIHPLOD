"use client";

import { useState } from "react";
import { Search, ShieldAlert, Award, Download, Globe, RefreshCw } from "lucide-react";
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
        setError("未查询到相关授权信息，请核对编号。");
      }
      setIsSearching(false);
    }, 1200);
  };

  return (
    <main className="relative min-h-screen mesh-gradient flex flex-col items-center selection:bg-slate-900 selection:text-white">
      {/* 顶部导航 */}
      <nav className="w-full max-w-6xl px-6 py-8 flex justify-between items-center z-20">
         <div className="flex items-center gap-3">
            <img src="/NIHPLOD-logo.svg" alt="NIHPLOD" className="h-9 w-auto" />
            <div className="w-px h-6 bg-slate-200 mx-1" />
            <span className="text-base font-bold tracking-tight text-slate-900">授权验证系统</span>
         </div>
         <div className="flex gap-6 text-xs font-bold tracking-wider text-slate-400">
           <Link href="/login" className="hover:text-primary transition-colors">管理端登录</Link>
           <Link href="/demo/certificate" className="hover:text-primary transition-colors">引擎演示</Link>
         </div>
      </nav>

      {/* 核心核验区域 */}
      <div className="flex-1 flex flex-col items-center justify-center w-full max-w-4xl px-6 relative z-10 -mt-12">
        <motion.div 
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center space-y-6 mb-12"
        >
          <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-slate-50 border border-slate-100 rounded-full mb-2 shadow-sm">
            <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">品牌官方核验中心 · 数据库已同步</span>
          </div>
          <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight text-slate-900">
            品牌授权验证中心
          </h1>
          <p className="text-slate-500 text-base md:text-lg max-w-xl mx-auto leading-relaxed">
            保护品牌信誉，确保每一位经销商资质的真实与合法。
          </p>
        </motion.div>

        {/* 搜索框 */}
        <motion.div 
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="w-full max-w-xl mb-10"
        >
          <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1 relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-300" />
              <input 
                type="text" 
                placeholder="请输入证书编号 (如: BAVP-2024-001)" 
                className="w-full bg-white border border-slate-200 rounded-xl py-4 pl-12 pr-4 text-slate-900 focus:border-primary focus:ring-4 focus:ring-primary/5 transition-all outline-none"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <button 
              disabled={isSearching}
              className="bg-slate-900 text-white font-bold px-10 py-4 rounded-xl hover:bg-slate-800 active:scale-[0.98] transition-all disabled:opacity-50 whitespace-nowrap shadow-sm"
            >
              {isSearching ? <RefreshCw className="w-5 h-5 animate-spin mx-auto" /> : "查询验证"}
            </button>
          </form>
        </motion.div>

        {/* 结果显示 */}
        <div className="w-full max-w-2xl min-h-[300px]">
          <AnimatePresence mode="wait">
            {isSearching && (
              <motion.div 
                key="loading" 
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="flex flex-col items-center pt-10"
              >
                <div className="w-6 h-6 border-2 border-slate-200 border-t-primary rounded-full animate-spin mb-4" />
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">正在联机核验...</span>
              </motion.div>
            )}

            {error && !isSearching && (
              <motion.div 
                initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                className="bg-red-50/50 border border-red-100 p-6 rounded-xl flex items-center gap-4 text-red-600 shadow-sm"
              >
                <ShieldAlert className="w-6 h-6 shrink-0" />
                <p className="text-sm font-semibold">{error}</p>
              </motion.div>
            )}

            {result && !isSearching && (
              <motion.div 
                initial={{ opacity: 0, scale: 0.98, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }}
                className="bg-white border border-slate-200 p-8 md:p-10 rounded-2xl shadow-md relative overflow-hidden"
              >
                <div className="flex flex-col md:flex-row justify-between gap-6">
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 text-emerald-600 font-bold text-[10px] uppercase tracking-widest bg-emerald-50 w-fit px-3 py-1 rounded-full">
                       <Award className="w-3.5 h-3.5" /> 认证通过
                    </div>
                    <div>
                       <h2 className="text-2xl md:text-3xl font-bold text-slate-900">{result.dealerName}</h2>
                       <p className="text-slate-400 text-xs mt-1 font-mono uppercase">授权编号: {result.id}</p>
                    </div>
                    
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-12 gap-y-6 pt-6 border-t border-slate-50">
                       <div className="space-y-1">
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">有效期至</span>
                          <p className="text-base font-bold text-slate-800">{result.duration}</p>
                       </div>
                       <div className="space-y-1">
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">授权区域</span>
                          <p className="text-base font-bold text-slate-800">{result.scope}</p>
                       </div>
                    </div>

                    <div className="pt-8 flex flex-wrap gap-3">
                      <button className="bg-slate-900 text-white font-bold px-6 py-3 rounded-lg text-xs flex items-center gap-2 hover:bg-slate-800 transition-all font-sans">
                        <Download className="w-4 h-4" /> 证书下载
                      </button>
                      <button className="bg-white border border-slate-200 text-slate-600 font-bold px-6 py-3 rounded-lg text-xs flex items-center gap-2 hover:bg-slate-50 transition-all font-sans">
                        <Globe className="w-4 h-4" /> 官方渠道
                      </button>
                    </div>
                  </div>

                  <div className="hidden md:flex flex-col items-center justify-center p-6 bg-slate-50 rounded-xl border border-slate-100">
                     <div className="w-24 h-24 bg-white border border-slate-100 rounded-lg shadow-sm flex items-center justify-center p-2">
                        <img src="/NIHPLOD-logo.svg" alt="NIHPLOD" className="w-full h-auto opacity-20 grayscale" />
                     </div>
                     <span className="text-[9px] font-bold text-slate-400 mt-3 uppercase tracking-tighter">验证二维码</span>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* 页脚装饰 - 最终修正版 */}
      <footer className="w-full max-w-6xl px-6 py-12 flex flex-col md:flex-row justify-between items-center gap-6 border-t border-slate-50 mt-auto text-slate-400">
         <p className="text-[11px] font-normal text-slate-300 tracking-normal antialiased">
           &copy; 2026 BA.NIHPLOD.CN. All rights reserved
         </p>
         <div className="flex gap-8 text-[11px] font-medium tracking-tight">
            <span className="hover:text-slate-900 cursor-pointer">服务协议</span>
            <span className="hover:text-slate-900 cursor-pointer">隐私声明</span>
         </div>
      </footer>
    </main>
  );
}

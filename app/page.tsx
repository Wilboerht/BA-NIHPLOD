"use client";

import { useState } from "react";
import { Search, ShieldAlert, Download, Globe, RefreshCw, CheckCircle2, ArrowRight, X } from "lucide-react";
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
    
    // 模拟查询流程
    setTimeout(() => {
      const found = MOCK_CERTIFICATES[query.toUpperCase()];
      if (found) {
        setResult(found);
      } else {
        setError("未查询到相关授权信息，请核对编号后重试。");
      }
      setIsSearching(false);
    }, 1200);
  };

  return (
    <main className="relative h-screen w-full flex flex-col justify-between items-center selection:bg-slate-200 overflow-hidden"
          style={{ background: "radial-gradient(circle at center, #fffdfa 0%, #f7efe6 100%)" }}>
      
      {/* 底部光晕 */}
      <div className="absolute inset-0 pointer-events-none opacity-20" 
           style={{ background: "radial-gradient(circle at 50% 35%, rgba(194, 65, 12, 0.05) 0%, transparent 75%)" }} />

      {/* 顶部导航 */}
      <nav className="w-full max-w-7xl px-12 py-10 flex justify-between items-center z-20 shrink-0">
         <div className="flex items-center gap-5 transition-all hover:opacity-80">
            <img src="/NIHPLOD-logo.svg" alt="NIHPLOD" className="h-8 w-auto" />
            <div className="w-px h-5 bg-slate-300/60 mx-0.5" />
            <span className="text-[17px] font-extrabold tracking-tight text-slate-700 leading-none">授权验证系统</span>
         </div>
      </nav>

      {/* 核心内容区 - 基于 Typography Scale 设计最佳实践 */}
      <div className="flex-1 flex flex-col items-center justify-center w-full max-w-4xl px-8 relative z-10 -mt-20">
        
        <div className="w-full flex flex-col items-center">
          {/* 文案区 - 建立绝对视觉层级 */}
          <motion.div 
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
            className="text-center space-y-6 mb-12"
          >
            <div className="space-y-4">
              <h1 className="text-4xl md:text-[42px] font-extrabold tracking-[-0.02em] text-slate-800 leading-none">
                NIHPLOD 品牌授权核验中心
              </h1>
              <p className="text-slate-400 text-sm md:text-base max-w-lg mx-auto leading-[1.8] font-medium opacity-80">
                请输入授权证书编号，以验证经销商经营资质。
              </p>
            </div>
          </motion.div>

          {/* 搜索框 - 增强行动点分量 */}
          <motion.div 
            initial={{ opacity: 0, scale: 0.995 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.2, duration: 1 }}
            className="w-full max-w-xl"
          >
            <form 
              onSubmit={handleSearch} 
              className="group relative flex items-center p-1.5 bg-white/40 backdrop-blur-2xl border border-white/80 rounded-2xl shadow-[0_25px_50px_-12px_rgba(0,0,0,0.04)] focus-within:shadow-[0_45px_80px_-16px_rgba(0,0,0,0.06)] transition-all duration-700"
            >
              <div className="flex-1 relative flex items-center">
                <Search className="absolute left-6 w-4.5 h-4.5 text-slate-400 group-focus-within:text-slate-500 transition-colors" />
                <input 
                  type="text" 
                  placeholder="输入证书编号 ( 示例: BAVP-2024-001 )" 
                  className="w-full bg-transparent border-none outline-none pl-15 pr-6 py-4 text-slate-900 text-[15px] font-bold placeholder:text-slate-300 placeholder:font-normal focus:ring-0 transition-all font-sans"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </div>
              <button 
                disabled={isSearching}
                className="bg-[#c2410c] text-white font-extrabold h-11 px-9 rounded-[14px] hover:bg-[#a1360a] active:scale-[0.97] transition-all disabled:opacity-50 flex items-center gap-2.5 shadow-xl shadow-orange-900/10 text-sm tracking-wide"
              >
                {isSearching ? <RefreshCw className="w-4 h-4 animate-spin mx-3" /> : (
                  <>
                     查询验证
                     <ArrowRight className="w-4 h-4 ml-0.5" />
                  </>
                )}
              </button>
            </form>
          </motion.div>
        </div>
      </div>

      {/* 结果模态框 */}
      <AnimatePresence>
        {(result || error) && !isSearching && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-6 md:p-12">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => { setResult(null); setError(null); }}
              className="absolute inset-0 bg-slate-900/10 backdrop-blur-md"
            />
            
            <motion.div 
              initial={{ opacity: 0, scale: 0.96, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 20 }}
              className="relative w-full max-w-2xl bg-white border border-white/80 rounded-[36px] shadow-[0_60px_120px_-20px_rgba(0,0,0,0.15)] p-12 md:p-16 overflow-hidden"
            >
              <button 
                 onClick={() => { setResult(null); setError(null); }}
                 className="absolute top-10 right-10 text-slate-300 hover:text-slate-500 transition-colors"
              >
                <X className="w-6 h-6" />
              </button>

              {error ? (
                <div className="flex flex-col items-center text-center py-10 gap-8">
                  <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center text-red-500">
                    <ShieldAlert className="w-8 h-8" />
                  </div>
                  <div className="space-y-2">
                     <p className="text-2xl font-extrabold text-slate-800">查无此授权编号</p>
                     <p className="text-sm text-slate-400 leading-relaxed max-w-xs mx-auto">请核查您的编号是否正确，若确有其事但无记录，请务必联系品牌官方。</p>
                  </div>
                  <button 
                    onClick={() => { setError(null); }}
                    className="mt-6 bg-slate-100 hover:bg-slate-200 text-slate-600 px-12 py-3.5 rounded-2xl font-bold text-sm transition-all"
                  >
                    返回主页
                  </button>
                </div>
              ) : (
                <div className="flex flex-col md:flex-row justify-between items-start gap-12">
                  <div className="flex-1 space-y-12">
                    <div className="flex items-center gap-3 text-[#c2410c] font-bold text-[10px] uppercase tracking-widest bg-orange-50/60 px-5 py-2 rounded-full border border-orange-200/50 w-fit">
                       <CheckCircle2 className="w-4 h-4" /> Official Certified
                    </div>
                    
                    <div className="space-y-3">
                       <h2 className="text-4xl md:text-5xl font-extrabold text-slate-800 tracking-tight leading-tight">{result.dealerName}</h2>
                       <p className="text-slate-300 text-xs font-bold font-mono tracking-[0.3em] uppercase opacity-60">SN: {result.id}</p>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-16 pt-12 border-t border-slate-100">
                       <div className="space-y-2">
                          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest leading-none">截止日期</span>
                          <p className="text-xl font-bold text-slate-700 tracking-tight italic">{result.duration}</p>
                       </div>
                       <div className="space-y-2">
                          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest leading-none">授权区域</span>
                          <p className="text-xl font-bold text-slate-700 tracking-tight">{result.scope}</p>
                       </div>
                    </div>

                    <div className="pt-10 flex flex-wrap gap-5">
                      <button className="bg-slate-900 text-white font-bold h-13 px-10 rounded-2xl text-xs flex items-center gap-3 hover:bg-slate-800 transition-all shadow-2xl shadow-slate-900/10 active:scale-95">
                        <Download className="w-5 h-5 opacity-60" /> 保存防伪证书
                      </button>
                    </div>
                  </div>

                  <div className="hidden md:flex flex-col items-center gap-10 p-14 bg-slate-50/40 rounded-[48px] border border-white/40 self-stretch justify-center">
                     <div className="w-28 h-28 bg-white/80 border border-white/90 rounded-3xl shadow-sm flex items-center justify-center p-6 grayscale opacity-20">
                        <img src="/NIHPLOD-logo.svg" alt="LOGO" className="w-full h-auto" />
                     </div>
                     <p className="text-[9px] font-extrabold text-slate-200 uppercase tracking-[0.4em] text-center leading-relaxed">SECURED BY<br />NIHPLOD GENOME</p>
                  </div>
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* 页脚 */}
      <footer className="w-full max-w-7xl px-12 py-10 flex flex-col md:flex-row justify-between items-center gap-4 shrink-0 border-t border-slate-100/30">
         <p className="text-[11px] font-normal text-slate-300 tracking-normal antialiased">
           &copy; 2026 NIHPLOD. All rights reserved
         </p>
         <div className="flex gap-12 text-[11px] font-bold text-slate-400 uppercase tracking-[0.1em]">
            <Link href="/login" className="hover:text-slate-900 transition-colors">统一登陆</Link>
            <span className="hover:text-slate-900 cursor-pointer transition-colors">服务协议</span>
            <span className="hover:text-slate-900 cursor-pointer transition-colors">隐私声明</span>
         </div>
      </footer>
    </main>
  );
}

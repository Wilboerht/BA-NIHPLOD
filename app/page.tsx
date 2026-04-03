"use client";

import { useState } from "react";
import { Search, ShieldAlert, Award, Download, Globe, RefreshCw, CheckCircle2, ArrowRight } from "lucide-react";
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
        setError("未查询到相关授权信息，请核对。");
      }
      setIsSearching(false);
    }, 1200);
  };

  return (
    <main className="relative h-screen w-full flex flex-col justify-between items-center selection:bg-slate-200 overflow-hidden"
          style={{ background: "radial-gradient(circle at center, #fffdfa 0%, #f7efe6 100%)" }}>
      
      {/* 极轻微的动态背景色斑 */}
      <div className="absolute inset-0 pointer-events-none opacity-20" 
           style={{ background: "radial-gradient(circle at 50% 30%, rgba(194, 65, 12, 0.04) 0%, transparent 70%)" }} />

      {/* 顶部导航 - 更加靠边的精致布局 */}
      <nav className="w-full max-w-7xl px-12 py-10 flex justify-between items-center z-20 shrink-0">
         <div className="flex items-center gap-4 transition-all hover:opacity-80">
            <img src="/NIHPLOD-logo.svg" alt="NIHPLOD" className="h-8 w-auto" />
            <div className="w-px h-5 bg-slate-300/50 mx-1" />
            <span className="text-sm font-bold tracking-tight text-slate-700">授权验证系统</span>
         </div>
      </nav>

      {/* 核心内容区 - 垂直居中 */}
      <div className="flex-1 flex flex-col items-center justify-center w-full max-w-4xl px-8 relative z-10 -mt-10">
        
        <div className="w-full flex flex-col items-center">
          {/* 文案区 */}
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center space-y-4 mb-10"
          >
            <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight text-slate-800 opacity-90">
              品牌授权验证中心
            </h1>
            <p className="text-slate-400 text-sm md:text-base max-w-lg mx-auto leading-relaxed font-medium">
              实时核检经销商资质的真实性、合法性及经营范围。
            </p>
          </motion.div>

          {/* 搜索框 - 极致精简 */}
          <motion.div 
            initial={{ opacity: 0, scale: 0.99 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-lg mb-8"
          >
            <form 
              onSubmit={handleSearch} 
              className="group relative flex items-center p-1.5 bg-white/40 backdrop-blur-xl border border-white/80 rounded-2xl shadow-[0_20px_40px_-15px_rgba(0,0,0,0.04)] focus-within:shadow-[0_40px_70px_-20px_rgba(0,0,0,0.06)] transition-all duration-500"
            >
              <div className="flex-1 relative flex items-center">
                <Search className="absolute left-6 w-4.5 h-4.5 text-slate-400 group-focus-within:text-slate-500 transition-colors" />
                <input 
                  type="text" 
                  placeholder="输入证书编号 ( 示例: BAVP-2024-001 )" 
                  className="w-full bg-transparent border-none outline-none pl-15 pr-6 py-4 text-slate-900 text-[14px] font-semibold placeholder:text-slate-400/60 placeholder:font-normal focus:ring-0 transition-all tracking-normal"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </div>
              <button 
                disabled={isSearching}
                className="bg-[#c2410c] text-white font-bold h-10 px-7 rounded-xl hover:bg-[#a1360a] active:scale-[0.97] transition-all disabled:opacity-50 flex items-center gap-2 shadow-lg shadow-orange-900/10 text-[13px]"
              >
                {isSearching ? <RefreshCw className="w-4 h-4 animate-spin mx-2" /> : (
                  <>
                     搜索验证
                     <ArrowRight className="w-3.5 h-3.5" />
                  </>
                )}
              </button>
            </form>
          </motion.div>

          {/* 结果显示容器 - 控制高度 */}
          <div className="w-full max-w-2xl h-[340px] flex items-start justify-center">
            <AnimatePresence mode="wait">
              {isSearching && (
                <motion.div 
                  key="loading" 
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  className="flex flex-col items-center pt-10 gap-6"
                >
                  <div className="w-8 h-8 border-2 border-slate-100 border-t-[#c2410c] rounded-full animate-spin" />
                  <span className="text-[10px] font-bold text-slate-300 uppercase tracking-[0.3em] ml-4">安全核实中</span>
                </motion.div>
              )}

              {error && !isSearching && (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                  className="bg-white/40 backdrop-blur-md border border-red-100 p-8 rounded-[24px] flex flex-col items-center text-center gap-4 shadow-sm"
                >
                  <div className="w-10 h-10 bg-red-50 rounded-full flex items-center justify-center text-red-500">
                    <ShieldAlert className="w-5 h-5" />
                  </div>
                  <div className="space-y-1">
                     <p className="text-base font-bold text-slate-800">未查询到授权</p>
                     <p className="text-xs text-slate-400">请核对您输入的编号。若确信无误，请联系品牌官方。</p>
                  </div>
                </motion.div>
              )}

              {result && !isSearching && (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.99, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }}
                  className="relative bg-white/60 backdrop-blur-[32px] border border-white/90 p-8 md:p-10 rounded-[28px] shadow-[0_40px_80px_-20px_rgba(0,0,0,0.06)] w-full"
                >
                  <div className="flex flex-col md:flex-row justify-between items-start gap-10">
                    <div className="flex-1 space-y-6">
                      <div className="flex items-center gap-2.5 text-[#c2410c] font-bold text-[9px] uppercase tracking-widest bg-orange-50/60 px-4 py-1 rounded-full border border-orange-100/50 w-fit">
                         <CheckCircle2 className="w-3.5 h-3.5" /> 身份核实通过
                      </div>
                      <div className="space-y-2">
                         <h2 className="text-3xl font-extrabold text-slate-800 tracking-tight">{result.dealerName}</h2>
                         <p className="text-slate-300 text-[11px] font-bold font-mono tracking-[0.2em] uppercase opacity-70">SN: {result.id}</p>
                      </div>
                      <div className="grid grid-cols-2 gap-10 pt-6 border-t border-slate-100">
                         <div className="space-y-1">
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none">到期日期</span>
                            <p className="text-base font-bold text-slate-700 tracking-tight">{result.duration}</p>
                         </div>
                         <div className="space-y-1">
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none">授权区域</span>
                            <p className="text-base font-bold text-slate-700 tracking-tight">{result.scope}</p>
                         </div>
                      </div>
                      <div className="pt-6 flex flex-wrap gap-4">
                        <button className="bg-slate-900 text-white font-bold h-10 px-7 rounded-xl text-[12px] flex items-center gap-2.5 hover:bg-slate-800 transition-all shadow-lg shadow-slate-900/10 mb-2">
                          <Download className="w-4 h-4 opacity-70" /> 导出证书
                        </button>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* 页脚 - 极简沉在最底 */}
      <footer className="w-full max-w-7xl px-12 py-10 flex flex-col md:flex-row justify-between items-center gap-4 shrink-0 border-t border-slate-100/30">
         <p className="text-[11px] font-normal text-slate-300 tracking-normal antialiased">
           &copy; 2026 NIHPLOD. All rights reserved
         </p>
         <div className="flex gap-12 text-[11px] font-bold text-slate-400 uppercase tracking-[0.1em]">
            <Link href="/login" className="hover:text-slate-900 transition-colors">管理登录</Link>
            <span className="hover:text-slate-900 cursor-pointer transition-colors">服务协议</span>
            <span className="hover:text-slate-900 cursor-pointer transition-colors">隐私声明</span>
         </div>
      </footer>
    </main>
  );
}

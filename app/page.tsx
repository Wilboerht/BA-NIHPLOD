"use client";

import { useState } from "react";
import { Search, ShieldAlert, Download, Globe, RefreshCw, CheckCircle2, ArrowRight, X, Megaphone, Camera, AlertTriangle } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import LoginModal from "@/components/LoginModal";
import { verifyCertificateAction, type CertificateVerifyResult } from "@/app/actions";

export default function VerificationPage() {
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<CertificateVerifyResult | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showReportModal, setShowReportModal] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(false);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // 1. 防护机制：防止重复提交 (Double-click prevention / basic debounce)
    if (isSearching) return; 

    // 2. 清洗数据
    const cleanQuery = query.trim();
    if (!cleanQuery) return;

    if (cleanQuery.length < 2) {
      setError("输入内容过短。");
      setResult(null);
      return;
    }
    
    if (cleanQuery.length > 50) {
      setError("输入内容过长。");
      setResult(null);
      return;
    }

    setIsSearching(true);
    setResult(null);
    setError(null);
    
    try {
      // 传入清洗后的 query 数据
      const res = await verifyCertificateAction(cleanQuery);
      if (res.success && res.data) {
        setResult(res.data);
      } else {
        setError(res.error || "未查询到相关授权信息。");
      }
    } catch (err) {
      console.error(err);
      setError("系统查询出错，请稍后再试。");
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <main className="relative h-screen w-full flex flex-col justify-between items-center selection:bg-[#8B7355]/20 overflow-hidden font-sans"
          style={{ background: "#FAFAFA" }}>
      
      {/* 装饰渐变 & 矿物纹理叠加 */}
      <div className="absolute inset-0 pointer-events-none opacity-[0.03] z-0" 
           style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E\")" }} />
      
      {/* 动态流体全屏流转 (Sophisticated Balanced Full-screen Glows) */}
      {/* 1. 琥珀色 - 主色调 (Amber - Primary Flow) */}
      <motion.div 
           className="absolute w-[600px] h-[600px] md:w-[1000px] md:h-[1000px] rounded-full pointer-events-none blur-[120px] md:blur-[160px] z-0" 
           style={{ background: "radial-gradient(circle, #8B7355 0%, #8B7355 8%, transparent 65%)" }}
           animate={{
              x: ['-10vw', '60vw', '10vw', '85vw', '-10vw'],
              y: ['-10vh', '40vh', '85vh', '15vh', '-10vh'],
              scale: [1, 1.25, 0.85, 1.15, 1],
              opacity: [0.1, 0.22, 0.15, 0.25, 0.1],
              scaleX: [1, 1.4, 0.7, 1.2, 1],
              scaleY: [1, 0.6, 1.3, 0.8, 1],
           }}
           transition={{ duration: 50, repeat: Infinity, ease: "linear" }}
      />
      {/* 2. 暖亚麻 - 逆向漂移 (Warm Linen - Inverse Flow) */}
      <motion.div 
           className="absolute w-[500px] h-[500px] md:w-[900px] md:h-[900px] rounded-full pointer-events-none blur-[110px] md:blur-[150px] z-0" 
           style={{ background: "radial-gradient(circle, #E5DED4 0%, #D4BC9B 10%, transparent 68%)" }}
           animate={{
              x: ['85vw', '15vw', '75vw', '-10vw', '85vw'],
              y: ['10vh', '80vh', '20vh', '65vh', '10vh'],
              scale: [0.9, 1.15, 1.05, 0.8, 0.9],
              opacity: [0.12, 0.28, 0.2, 0.32, 0.12],
              scaleX: [1.1, 0.8, 1.3, 0.9, 1.1],
              scaleY: [0.8, 1.2, 0.75, 1.15, 0.8],
           }}
           transition={{ duration: 65, repeat: Infinity, ease: "linear" }}
      />
      {/* 3. 香槟金 - 交叉扰动 (Champagne Gold - Cross-current Flow) */}
      <motion.div 
           className="absolute w-[400px] h-[400px] md:w-[800px] md:h-[800px] rounded-full pointer-events-none blur-[80px] md:blur-[130px] z-0" 
           style={{ background: "radial-gradient(circle, #F7E7CE 0%, #F1E5AC 12%, transparent 65%)" }}
           animate={{
              x: ['20vw', '85vw', '-15vw', '50vw', '20vw'],
              y: ['85vh', '5vh', '45vh', '-10vh', '85vh'],
              scale: [0.85, 1.25, 0.9, 1.2, 0.85],
              opacity: [0.15, 0.3, 0.2, 0.35, 0.15],
              scaleX: [1.2, 0.85, 1.1, 0.75, 1.2],
              scaleY: [0.75, 1.2, 0.9, 1.25, 0.75],
           }}
           transition={{ duration: 42, repeat: Infinity, ease: "linear" }}
      />

      {/* 顶部导航 */}
      <nav className="w-full max-w-7xl px-12 py-10 flex justify-between items-center z-20 shrink-0">
         <div className="flex items-center gap-5 transition-all hover:opacity-80">
            <img src="/NIHPLOD-logo.svg" alt="NIHPLOD" className="h-8 w-auto" />
            <div className="w-px h-5 bg-slate-300/60 mx-0.5" />
            <span className="text-[17px] font-medium tracking-[0.2em] uppercase text-[#2C2A29] leading-none">授权核验中心</span>
         </div>
         
         <Link 
            href="https://nihplod.cn"
            target="_blank"
            className="flex items-center gap-2 text-[11px] font-bold tracking-[0.2em] uppercase text-[#8B7355] hover:text-[#2C2A29] transition-colors"
         >
            <Globe className="w-4 h-4" />
            返回品牌官网
         </Link>
      </nav>

      {/* 核心内容区 */}
      <div className="flex-1 flex flex-col items-center justify-center w-full max-w-4xl px-8 relative z-10 -mt-20">
        <div className="w-full flex flex-col items-center">
          <motion.div 
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center space-y-6 mb-12"
          >
            <div className="space-y-6">
              <h1 className="text-4xl md:text-[44px] tracking-[0.05em] text-[#2C2A29] leading-tight">
                NIHPLOD 品牌授权核验中心
              </h1>
              <p className="text-[#8B7355] text-sm md:text-base max-w-lg mx-auto leading-loose opacity-90 tracking-[0.02em]">
                请输入授权证书编号或经销主体主体名称，验证经营资质。
              </p>
            </div>
          </motion.div>


          {/* 搜索框区 */}
          <motion.div 
            initial={{ opacity: 0, scale: 0.995 }} animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-xl"
          >
            <form 
              onSubmit={handleSearch} 
              className="group relative flex items-center p-1.5 bg-white/60 backdrop-blur-2xl border border-white/80 rounded-2xl shadow-[0_25px_50px_-12px_rgba(0,0,0,0.04)] focus-within:shadow-[0_45px_80px_-16px_rgba(0,0,0,0.06)] transition-all duration-700"
            >
              <div className="flex-1 relative flex items-center">
                <Search className="absolute left-6 w-4.5 h-4.5 text-slate-400 group-focus-within:text-slate-500 transition-colors" />
                <input 
                  type="text" 
                  placeholder="输入证书编号 (SN) 或 经销商企业名称" 
                  className="w-full bg-transparent border-none outline-none pl-15 pr-6 py-4 text-[#2C2A29] text-[15px] placeholder:text-[#8B7355]/50 focus:ring-0 transition-all font-sans tracking-wide"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </div>
              <button 
                disabled={isSearching || !query.trim()}
                className="bg-[#2C2A29] text-white h-11 px-9 rounded-[14px] hover:bg-[#1A1918] active:scale-[0.97] transition-all disabled:opacity-50 flex items-center gap-2.5 shadow-lg shadow-[#2C2A29]/10 text-sm tracking-[0.1em]"
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
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => { setResult(null); setError(null); }}
              className="absolute inset-0 bg-slate-900/10 backdrop-blur-sm"
            />
            
            <motion.div 
              initial={{ opacity: 0, scale: 0.96, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 20 }}
              className="relative w-full max-w-2xl bg-white/90 backdrop-blur-3xl border border-white/60 rounded-[36px] shadow-[0_40px_80px_-20px_rgba(44,42,41,0.08)] p-12 md:p-16 overflow-hidden"
            >
              <button 
                 onClick={() => { setResult(null); setError(null); }}
                 className="absolute top-10 right-10 text-slate-300 hover:text-slate-500 transition-colors"
              >
                <X className="w-6 h-6" />
              </button>

              {error ? (
                <div className="flex flex-col items-center text-center py-10 gap-8">
                  <div className="flex bg-[#8B7355]/5 border border-[#8B7355]/20 rounded-full items-center justify-center text-[#8B7355] h-16 w-16 mb-6 mx-auto">
                    <ShieldAlert className="w-8 h-8" />
                  </div>
                  <div className="space-y-4 text-center">
                     <div className="space-y-5">
                        <p className="text-[22px] text-[#2C2A29] tracking-wide leading-snug px-4">{error}</p>
                        <p className="text-[13px] md:text-sm text-[#8B7355]/80 leading-relaxed max-w-xl mx-auto px-4">
                          请核查您填写的检索信息是否准确无误。<br className="hidden md:block" />
                          为保障您的权益，如遇疑似未经官方授权的商业行为，请向我们提交反馈。
                        </p>
                     </div>
                     <button 
                        onClick={() => { setError(null); setShowReportModal(true); }}
                        className="bg-[#2C2A29]/5 text-[#2C2A29] border border-[#2C2A29]/10 px-8 py-3 rounded-xl text-sm hover:bg-[#2C2A29]/10 transition-all flex items-center justify-center gap-2 mx-auto tracking-[0.1em] mt-8"
                      >
                        <AlertTriangle className="w-4 h-4" /> 举报涉嫌侵权经销商
                      </button>
                  </div>
                </div>
              ) : result ? (
                <div className="flex flex-col md:flex-row justify-between items-start gap-12">
                  <div className="flex-1 space-y-12">
                    <div className="flex items-center gap-3 text-[#8B7355] text-[10px] uppercase tracking-[0.2em] bg-[#8B7355]/10 px-5 py-2 rounded-full border border-[#8B7355]/20 w-fit">
                       <CheckCircle2 className="w-4 h-4" /> Official Certified
                    </div>
                    
                    <div className="space-y-3">
                       <h2 className="text-3xl md:text-4xl text-[#2C2A29] tracking-[0.05em] leading-tight">{result.dealerName}</h2>
                       <p className="text-[#8B7355]/70 text-xs font-mono tracking-[0.3em] uppercase">SN: {result.id}</p>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-16 pt-12 border-t border-[#8B7355]/10">
                       <div className="space-y-2">
                          <span className="text-[10px] text-[#8B7355] uppercase tracking-[0.2em] leading-none">截止日期</span>
                          <p className="text-lg text-[#2C2A29] tracking-widest">{result.duration}</p>
                       </div>
                       <div className="space-y-2">
                          <span className="text-[10px] text-[#8B7355] uppercase tracking-[0.2em] leading-none">授权区域</span>
                          <p className="text-lg text-[#2C2A29] tracking-widest">{result.scope}</p>
                       </div>
                    </div>

                    <div className="pt-10 flex flex-wrap gap-5">
                      <button className="bg-[#2C2A29] text-white h-12 px-10 rounded-2xl text-[11px] uppercase tracking-[0.2em] flex items-center gap-3 hover:bg-[#1A1918] transition-all shadow-xl shadow-[#2C2A29]/10 active:scale-95">
                        <Download className="w-4 h-4 opacity-70" /> 保存防伪证书
                      </button>
                    </div>
                  </div>

                  <div className="hidden md:flex flex-col items-center gap-10 p-14 bg-[#FAFAFA]/50 rounded-[48px] border border-white/60 self-stretch justify-center">
                     <div className="w-28 h-28 bg-white/80 border border-white/90 rounded-3xl shadow-sm flex items-center justify-center p-6 grayscale opacity-40">
                        <img src="/NIHPLOD-logo.svg" alt="LOGO" className="w-full h-auto" />
                     </div>
                     <p className="text-[9px] text-[#8B7355]/50 uppercase tracking-[0.4em] text-center leading-loose">SECURED BY<br />NIHPLOD GENOME</p>
                  </div>
                </div>
              ) : null}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* 投诉举报模态框 */}
      <AnimatePresence>
        {showReportModal && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-6">
            <motion.div 
               initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
               onClick={() => setShowReportModal(false)}
               className="absolute inset-0 bg-slate-900/40 backdrop-blur-md"
            />
            <motion.div 
               initial={{ opacity: 0, scale: 0.98, y: 10 }}
               animate={{ opacity: 1, scale: 1, y: 0 }}
               exit={{ opacity: 0, scale: 0.98, y: 10 }}
               className="relative w-full max-w-xl bg-white rounded-[32px] shadow-2xl p-8 md:p-12 overflow-hidden"
            >
              <div className="flex justify-between items-center mb-8">
                 <div className="flex items-center gap-3 text-red-600 font-bold text-sm tracking-tight">
                    <AlertTriangle className="w-5 h-5" />
                    品牌打假举报反馈
                 </div>
                 <button onClick={() => setShowReportModal(false)} className="text-slate-300 hover:text-slate-500 transition-colors">
                    <X className="w-5 h-5" />
                 </button>
              </div>

              <div className="space-y-6">
                 <div className="space-y-2">
                    <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest ml-1">涉嫌侵权描述</label>
                    <textarea 
                       placeholder="请简要描述侵权行为，如假冒授权、贩卖假货、违规低价等..."
                       className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-5 text-sm outline-none focus:border-red-200 focus:ring-4 focus:ring-red-500/5 transition-all h-32 resize-none"
                    />
                 </div>
                 <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                       <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest ml-1">涉事渠道/店铺</label>
                       <input 
                          type="text" placeholder="如: 天猫 XXX 旗舰店"
                          className="w-full bg-slate-50 border border-slate-100 rounded-xl p-4 text-sm outline-none focus:border-red-200 focus:ring-4 focus:ring-red-500/5 transition-all"
                       />
                    </div>
                    <div className="space-y-2">
                       <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest ml-1">证据图片 (可选)</label>
                       <div className="w-full aspect-square md:aspect-auto md:h-[54px] bg-slate-50 border border-dashed border-slate-200 rounded-xl flex items-center justify-center text-slate-300 hover:text-slate-400 hover:border-slate-300 transition-all cursor-pointer">
                          <Camera className="w-5 h-5" />
                       </div>
                    </div>
                 </div>
                 <button className="w-full bg-[#2C2A29] text-white h-12 rounded-2xl hover:bg-[#1A1918] active:scale-[0.98] transition-all shadow-lg shadow-[#2C2A29]/10 mt-6 flex items-center justify-center gap-2.5 text-sm tracking-widest uppercase">
                    <ShieldAlert className="w-4.5 h-4.5 opacity-80" />
                    提交举报核查
                 </button>
                 <p className="text-center text-[10px] text-slate-300 tracking-tight">我们的法务部门将在 3-5 个工作日内核实并采取行动。感谢您的协助。</p>
              </div>
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
            <span onClick={() => setShowReportModal(true)} className="text-red-500/60 hover:text-red-600 cursor-pointer transition-colors flex items-center gap-2">
               <Megaphone className="w-3.5 h-3.5" /> 打假投诉
            </span>
            <span onClick={() => setShowLoginModal(true)} className="cursor-pointer hover:text-slate-900 transition-colors">统一登陆</span>
            <span className="hover:text-slate-900 cursor-pointer transition-colors">服务协议</span>
            <span className="hover:text-slate-900 cursor-pointer transition-colors">隐私声明</span>
         </div>
      </footer>
      <LoginModal isOpen={showLoginModal} onClose={() => setShowLoginModal(false)} />
    </main>
  );
}

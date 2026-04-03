"use client";

import { useState } from "react";
import { Search, ShieldAlert, Download, Globe, RefreshCw, CheckCircle2, ArrowRight, X, Megaphone, Camera, AlertTriangle } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import LoginModal from "@/components/LoginModal";

export default function VerificationPage() {
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<any>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showReportModal, setShowReportModal] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(false);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query) return;
    setIsSearching(true);
    setResult(null);
    setError(null);
    
    try {
      const { data, error } = await supabase
        .from('certificates')
        .select(`
          cert_number,
          start_date,
          end_date,
          auth_scope,
          status,
          dealers (
            company_name
          )
        `)
        .eq('cert_number', query.toUpperCase())
        .eq('status', 'ISSUED')
        .single();
      
      if (error || !data) {
        setError("未查询到相关授权信息。");
      } else {
        // --- 逻辑加固：判定是否过期 ---
        if (new Date() > new Date(data.end_date + 'T23:59:59')) {
          setError("查询到该授权编号，但该证书已于 " + data.end_date + " 过期失效。");
        } else {
          setResult({
            id: data.cert_number,
            dealerName: Array.isArray(data.dealers) ? (data.dealers[0] as any)?.company_name : (data.dealers as any)?.company_name,
            duration: `${data.start_date.replace(/-/g, '.')} - ${data.end_date.replace(/-/g, '.')}`,
            scope: data.auth_scope,
            status: data.status,
          });
        }
      }
    } catch (err) {
      console.error(err);
      setError("系统查询出错，请稍后再试。");
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <main className="relative h-screen w-full flex flex-col justify-between items-center selection:bg-slate-200 overflow-hidden"
          style={{ background: "radial-gradient(circle at center, #fffdfa 0%, #f7efe6 100%)" }}>
      
      {/* 装饰渐变 */}
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

      {/* 核心内容区 */}
      <div className="flex-1 flex flex-col items-center justify-center w-full max-w-4xl px-8 relative z-10 -mt-20">
        <div className="w-full flex flex-col items-center">
          <motion.div 
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
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

          {/* 搜索框 */}
          <motion.div 
            initial={{ opacity: 0, scale: 0.995 }}
            animate={{ opacity: 1, scale: 1 }}
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
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => { setResult(null); setError(null); }}
              className="absolute inset-0 bg-slate-900/10 backdrop-blur-sm"
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
                  <div className="space-y-4">
                     <div className="space-y-2">
                        <p className="text-2xl font-extrabold text-slate-800">查无此授权编号</p>
                        <p className="text-sm text-slate-400 leading-relaxed max-w-xs mx-auto">请核查您的编号。若该经销商坚称获得官方授权，请向我们举报反馈。</p>
                     </div>
                     <button 
                        onClick={() => { setError(null); setShowReportModal(true); }}
                        className="bg-red-50 text-red-600 px-8 py-3 rounded-xl font-bold text-sm hover:bg-red-100 transition-all flex items-center gap-2 mx-auto"
                      >
                        <AlertTriangle className="w-4 h-4" /> 举报涉嫌侵权经销商
                      </button>
                  </div>
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
                 <button className="w-full bg-[#0f253e] text-white font-extrabold h-12 rounded-2xl hover:bg-slate-800 active:scale-[0.98] transition-all shadow-xl shadow-blue-900/10 mt-6 flex items-center justify-center gap-2.5 text-sm tracking-widest uppercase">
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

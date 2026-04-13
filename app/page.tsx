"use client";

import { useState, useEffect, useRef } from "react";
import { Search, ShieldAlert, Download, Globe, RefreshCw, CheckCircle2, ArrowRight, X, Megaphone, Camera, AlertTriangle, QrCode, ChevronLeft, ChevronRight } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import LoginModal from "@/components/LoginModal";
import LegalModal from "@/components/LegalModal";
import DealerModalPanel from "@/components/DealerModalPanel";
import ResetPasswordModal from "@/components/ResetPasswordModal";
import { verifyCertificateAction, type CertificateVerifyResult } from "@/app/actions";
import { Html5QrcodeScanner, Html5QrcodeScannerState } from "html5-qrcode";

interface UserSession {
  id: string;
  phone?: string;
  username?: string;
  full_name?: string;
  role?: string;
  is_first_login?: boolean;
}

const getDurationStatus = (durationStr?: string, rawStatus?: string) => {
  if (rawStatus === 'REVOKED' || rawStatus === '已撤销') return { text: '已撤销', style: 'bg-stone-50 text-stone-500 border-stone-200' };

  if (!durationStr) return null;
  try {
    const parts = durationStr.split('-');
    if (parts.length !== 2) return null;
    
    // 将 YYYY.MM.DD 转换为 Safari 安全解析格式 YYYY/MM/DD
    const startStr = parts[0].trim().replace(/\./g, '/');
    const endStr = parts[1].trim().replace(/\./g, '/');
    
    const startDate = new Date(startStr);
    const endDate = new Date(endStr);
    // 把结束日期的时间拨到当天的 23:59:59 保证精准包容整天
    endDate.setHours(23, 59, 59, 999);
    
    const now = new Date();
    
    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) return null;
    
    if (now < startDate) return { text: '未生效', style: 'bg-amber-50 text-amber-600 border-amber-200' };
    if (now > endDate || rawStatus === 'EXPIRED' || rawStatus === '已失效') return { text: '已过期', style: 'bg-red-50 text-red-600 border-red-200' };
    return { text: '生效中', style: 'bg-emerald-50 text-emerald-600 border-emerald-200' };
  } catch {
    return null;
  }
};

export default function VerificationPage() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CertificateVerifyResult[] | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const result = results ? results[currentIndex] : null;
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showReportModal, setShowReportModal] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [showResetPasswordModal, setShowResetPasswordModal] = useState(false);
  const [showDealerModal, setShowDealerModal] = useState(false);
  const [showLegalModal, setShowLegalModal] = useState<{ isOpen: boolean; type: "service" | "privacy" }>({ isOpen: false, type: "service" });
  const [loggedInUser, setLoggedInUser] = useState<UserSession | null>(null);
  const [isPageLoading, setIsPageLoading] = useState(true);
  const prevShowLoginModalRef = useRef(false);
  const [evidenceFile, setEvidenceFile] = useState<File | null>(null);
  
  // 维权申诉提交状态
  const [isSubmittingReport, setIsSubmittingReport] = useState(false);
  const [reportSuccess, setReportSuccess] = useState(false);

  const handleReportSubmit = () => {
    setIsSubmittingReport(true);
    // 模拟数据提交过程
    setTimeout(() => {
      setIsSubmittingReport(false);
      setReportSuccess(true);
      // 成功展示2秒后自动清空数据并关闭弹窗
      setTimeout(() => {
        setReportSuccess(false);
        setShowReportModal(false);
        setEvidenceFile(null);
      }, 2000);
    }, 1500);
  };
  
  // 二维码扫描相关状态
  const [showScanner, setShowScanner] = useState(false);
  const [scannerReady, setScannerReady] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const scannerRef = useRef<Html5QrcodeScanner | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);

  // 页面加载时检查登录状态
  useEffect(() => {
    const checkLoginStatus = async () => {
      const userStr = sessionStorage.getItem("user");
      
      if (userStr) {
        try {
          const user = JSON.parse(userStr) as UserSession;

          // 如果是管理员，重定向到workbench
          if (user.role === "SUPER_ADMIN" || user.role === "AUDITOR" || user.role === "MANAGER" || user.role === "PROJECT_MANAGER") {
            window.location.href = "/workbench";
            return;
          }

          // 如果是经销商，设置状态但不自动打开面板
          if (user.role === "DEALER") {
            setLoggedInUser(user);
            // 页面刷新时不自动打开面板，只有登陆完成后才打开
          }
        } catch (e) {
          console.error("Failed to parse user session:", e);
        }
      }
      setIsPageLoading(false);
    };

    checkLoginStatus();
  }, []);

  // 初始化和清理扫描器
  useEffect(() => {
    if (showScanner && !scannerRef.current) {
      const scanner = new Html5QrcodeScanner(
        "qr-scanner-container",
        {
          fps: 10,
          qrbox: { width: 250, height: 250 },
          rememberLastUsedCamera: true,
          showTorchButtonIfSupported: true,
          aspectRatio: 1,
          useBarCodeDetectorIfSupported: false // 只识别二维码，不识别条形码
        },
        false
      );

      scanner.render(
        (decodedText: string) => {
          // 扫描成功
          setScanError(null);
          setIsScanning(true);
          
          // 从 URL 中提取证书编号
          let certNumber = decodedText;
          const urlParams = new URL(decodedText, "http://localhost").searchParams;
          if (urlParams.has("cert")) {
            certNumber = urlParams.get("cert") || decodedText;
          }
          
          // 停止扫描
          scanner.pause();
          
          // 执行验证查询
          handleScanVerify(certNumber);
        },
        (error: any) => {
          // 扫描持续中 - 忽略这些错误
          if (!error.toString().includes("NotAllowedError") && !error.toString().includes("PermissionDenied")) {
            console.log("Scanning...");
          }
        }
      );

      scannerRef.current = scanner;
      setScannerReady(true);
    }

    return () => {
      if (scannerRef.current && !showScanner) {
        try {
          scannerRef.current.clear();
          scannerRef.current = null;
          setScannerReady(false);
        } catch (e) {
          console.error("Failed to clean up scanner:", e);
        }
      }
    };
  }, [showScanner]);

  // 处理扫描验证
  const handleScanVerify = async (certNumber: string) => {
    setIsSearching(true);
    setResults(null);
    setCurrentIndex(0);
    setError(null);
    setScanError(null);

    try {
      const res = await verifyCertificateAction(certNumber.trim());
      if (res.success && res.data) {
        setResults(res.data);
        setCurrentIndex(0);
      } else {
        setError(res.error || "未查询到相关授权信息。");
      }
    } catch (err) {
      console.error(err);
      setError("系统查询出错，请稍后再试。");
    } finally {
      setIsSearching(false);
      setIsScanning(false);
      setShowScanner(false);
    }
  };

  // 关闭扫描器
  const handleCloseScanner = () => {
    if (scannerRef.current) {
      try {
        scannerRef.current.clear();
        scannerRef.current = null;
      } catch (e) {
        console.error("Failed to close scanner:", e);
      }
    }
    setShowScanner(false);
    setScannerReady(false);
    setScanError(null);
  };

  // 检查是否有经销商用户登录，当登录模态框从打开变为关闭时（登陆完成）才打开面板
  useEffect(() => {
    // 只在登陆模态框从true变为false时执行（即刚完成登陆）
    if (prevShowLoginModalRef.current && !showLoginModal) {
      const userStr = sessionStorage.getItem("user");
      if (userStr) {
        try {
          const user = JSON.parse(userStr) as UserSession;
          if (user.role === "DEALER") {
            setShowDealerModal(true);
          }
        } catch (e) {
          console.error("Failed to parse user session:", e);
        }
      }
    }
    // 更新ref值用于下一次比较
    prevShowLoginModalRef.current = showLoginModal;
  }, [showLoginModal]);

  const handleLogout = () => {
    sessionStorage.removeItem("user");
    setLoggedInUser(null);
    setShowDealerModal(false);
    window.location.href = "/";
  };

  const handleLoginClick = () => {
    if (loggedInUser?.role === "DEALER") {
      setShowDealerModal(true);
    } else {
      setShowLoginModal(true);
    }
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // 1. 防护机制：防止重复提交 (Double-click prevention / basic debounce)
    if (isSearching) return; 

    // 2. 清洗数据
    const cleanQuery = query.trim();
    if (!cleanQuery) return;

    if (cleanQuery.length < 2) {
      setError("输入内容过短。");
      setResults(null);
      setCurrentIndex(0);
      return;
    }
    
    if (cleanQuery.length > 50) {
      setError("输入内容过长。");
      setResults(null);
      setCurrentIndex(0);
      return;
    }

    setIsSearching(true);
    setResults(null);
    setCurrentIndex(0);
    setError(null);
    
    try {
      // 传入清洗后的 query 数据
      const res = await verifyCertificateAction(cleanQuery);
      if (res.success && res.data) {
        setResults(res.data);
        setCurrentIndex(0);
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
      <nav className="hidden md:flex w-full max-w-7xl px-6 md:px-12 py-6 md:py-10 justify-between items-center z-20 shrink-0">
         <div className="flex items-center gap-3 md:gap-5 transition-all hover:opacity-80">
            <img src="/NIHPLOD-logo.svg" alt="NIHPLOD" className="h-6 md:h-8 w-auto" />
            <div className="w-px h-4 md:h-5 bg-slate-300/60 mx-0.5 md:mx-1" />
            <span className="text-xs md:text-[17px] font-medium tracking-[0.1em] md:tracking-[0.2em] uppercase text-[#2C2A29] leading-none">授权核验中心</span>
         </div>
         
         <Link 
            href="https://nihplod.cn"
            target="_blank"
            className="flex items-center gap-1 md:gap-2 text-[10px] md:text-[11px] font-bold tracking-[0.1em] md:tracking-[0.2em] uppercase text-[#8B7355] hover:text-[#2C2A29] transition-colors"
         >
            <Globe className="w-3.5 h-3.5 md:w-4 md:h-4" />
            <span className="hidden sm:inline">返回品牌官网</span>
            <span className="sm:hidden">品牌官网</span>
         </Link>
      </nav>

      {/* 核心内容区 */}
      <div className="flex-1 flex flex-col items-center justify-center w-full max-w-4xl px-5 md:px-8 relative z-10 md:-mt-20">
        <div className="w-full flex flex-col items-center">
          <motion.div 
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center space-y-6 mb-12"
          >
            <div className="space-y-6">
              <img src="/NIHPLOD-logo.svg" alt="Logo" className="h-[34px] mx-auto md:hidden mb-8 opacity-90" />
              <h1 className="text-3xl md:text-[44px] font-black tracking-[0.12em] text-[#2C2A29] leading-tight">
                授权资质官方核查
              </h1>
              <p className="text-[#8B7355] text-sm md:text-base max-w-lg mx-auto leading-relaxed opacity-80 tracking-[0.05em] font-medium">
                输入授权证书编号 (SN) 或经销主体名称，<br /> 核实官方资质及合法经营区域。
              </p>
            </div>
          </motion.div>


          {/* 搜索框区 */}
          <motion.div 
            initial={{ opacity: 0, scale: 0.995 }} animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-2xl px-2"
          >
            <form 
              onSubmit={handleSearch} 
              className="group relative flex items-center bg-white/70 backdrop-blur-2xl border border-white/80 rounded-[28px] md:rounded-[32px] shadow-[0_25px_50px_-12px_rgba(0,0,0,0.04)] focus-within:shadow-[0_45px_80px_-16px_rgba(0,0,0,0.08)] transition-all duration-300 overflow-hidden"
            >
              <div className="flex-1 flex items-center pl-4 py-2 md:pl-8 md:py-3 gap-2.5">
                <Search className="w-4 h-4 md:w-[22px] md:h-[22px] flex-shrink-0 text-slate-400 group-focus-within:text-[#8B7355] transition-colors" />
                <input 
                  type="text" 
                  placeholder="输入证书编号或名称" 
                  className="w-full bg-transparent border-none outline-none p-0 text-[#2C2A29] text-[15px] md:text-base placeholder:text-[#8B7355]/45 hover:placeholder:text-[#8B7355]/60 focus:ring-0 transition-all font-medium truncate"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </div>

              {/* 按钮区 */}
              <div className="flex items-center gap-1.5 md:gap-2 pr-2 md:pr-3 py-2 flex-shrink-0">
                <button 
                  type="button"
                  onClick={() => setShowScanner(true)}
                  disabled={isSearching}
                  className="relative flex items-center justify-center h-10 w-10 md:h-[48px] md:w-[48px] rounded-[16px] md:rounded-[18px] bg-slate-100/70 hover:bg-slate-200/80 text-[#8B7355] hover:text-[#6B5346] active:scale-[0.96] transition-all duration-200 border border-slate-200/40 disabled:opacity-50 disabled:cursor-not-allowed"
                  title="扫描授权书二维码"
                >
                  <QrCode className="w-[18px] h-[18px] md:w-5 md:h-5" />
                </button>

                <button 
                  disabled={isSearching || !query.trim()}
                  className="relative flex items-center justify-center gap-1.5 h-10 md:h-[48px] px-5 md:px-7 rounded-[16px] md:rounded-[18px] bg-[#2C2A29] hover:bg-[#1A1918] text-white text-[13px] md:text-sm active:scale-[0.96] transition-all duration-200 shadow-md shadow-[#2C2A29]/20 hover:shadow-lg hover:shadow-[#2C2A29]/30 disabled:opacity-50 disabled:cursor-not-allowed font-bold tracking-widest uppercase"
                >
                  {isSearching ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                       <span>查询</span>
                       <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </div>
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
              onClick={() => { setResults(null); setCurrentIndex(0); setError(null); }}
              className="absolute inset-0 bg-slate-900/10 backdrop-blur-sm"
            />
            
            <motion.div 
              initial={{ opacity: 0, scale: 0.96, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 20 }}
              className="relative w-full max-w-2xl flex flex-col gap-4 md:gap-6 z-10"
            >
              <div className="relative w-full bg-white border border-white/60 rounded-[24px] md:rounded-[32px] shadow-2xl p-6 md:p-14 overflow-hidden">
                <div className="absolute top-4 right-4 md:top-6 md:right-6 z-50">
                  <button 
                    onClick={() => { setResults(null); setCurrentIndex(0); setError(null); }}
                    className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-50 text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                  >
                    <X size={16} strokeWidth={2.5} />
                  </button>
                </div>

              {error ? (
                <div className="flex flex-col items-center text-center py-10 gap-8">
                  <div className="flex bg-[#8B7355]/5 border border-[#8B7355]/20 rounded-full items-center justify-center text-[#8B7355] h-16 w-16 mb-6 mx-auto">
                    <ShieldAlert className="w-8 h-8" />
                  </div>
                  <div className="space-y-4 text-center">
                     <div className="space-y-4 md:space-y-5">
                        <p className="text-[17px] md:text-[22px] text-[#2C2A29] font-bold tracking-wide leading-snug px-2 md:px-4">{error}</p>
                        <p className="text-xs md:text-[13px] text-[#8B7355]/80 leading-relaxed max-w-xl mx-auto px-0 md:px-4">
                          请核查您填写的检索信息是否准确无误。<br className="hidden md:block" />
                          为保障您的权益，如遇疑似未经官方授权的商业行为，请向我们提交反馈。
                        </p>
                     </div>
                      <button 
                        onClick={() => { setError(null); setShowReportModal(true); setEvidenceFile(null); }}
                        className="bg-[#2C2A29]/5 text-[#2C2A29] border border-[#2C2A29]/10 px-8 py-3 rounded-xl text-sm hover:bg-[#2C2A29]/10 transition-all flex items-center justify-center gap-2 mx-auto tracking-[0.1em] mt-8 font-medium"
                      >
                        <AlertTriangle className="w-4 h-4" /> 官方维权申诉与核查
                      </button>
                  </div>
                </div>
              ) : result ? (
                <div className="relative w-full flex flex-col">
                  <div className="flex flex-col space-y-8 md:space-y-10 relative z-10">
                    <div className="space-y-5 px-2">
                      <div className="flex items-center gap-2 text-[#8B7355] text-[10px] font-bold tracking-[0.2em] bg-[#8B7355]/5 px-3 py-1.5 rounded-full border border-[#8B7355]/10 w-fit">
                         <CheckCircle2 className="w-3 h-3 md:w-3.5 md:h-3.5" /> 官方授权企业资质认证
                      </div>
                      
                      <div>
                         <h2 className="text-2xl md:text-[34px] font-black text-[#2C2A29] tracking-[0.05em] leading-snug break-words">{result.dealerName}</h2>
                         <div className="flex items-center gap-3 mt-4">
                           <span className="text-[9px] md:text-[10px] bg-[#8B7355]/10 text-[#8B7355] border border-[#8B7355]/20 px-2 py-0.5 rounded font-black uppercase tracking-widest leading-relaxed">SN</span>
                           <p 
                             className="text-[#8B7355] text-[11px] md:text-[13px] font-bold tracking-widest font-mono pt-[1px] cursor-pointer hover:underline decoration-dotted transition-all"
                             onClick={() => {
                               navigator.clipboard.writeText(result.id);
                               // 可以加个简单的 toast 效果，但先保持极简
                             }}
                             title="点击复制编号"
                           >
                              {result.id}
                           </p>
                         </div>
                      </div>
                    </div>
                    
                    {/* 分割线下半截：票据风格 */}
                    <div className="relative flex flex-col gap-6 md:gap-8 pt-8 md:pt-10 border-t border-dashed border-[#8B7355]/20 bg-slate-50/60 -mx-6 md:-mx-14 -mb-6 md:-mb-14 px-6 md:px-14 pb-10 md:pb-14 rounded-b-[24px] md:rounded-b-[32px]">
                       <div className="space-y-3 md:space-y-4 relative z-10">
                          <span className="text-[10px] md:text-[11px] text-[#8B7355] uppercase tracking-[0.2em] leading-none block font-bold">授权有效期限</span>
                          <div className="flex items-center gap-3">
                            <p className="text-[15px] md:text-lg text-[#2C2A29] tracking-wider font-semibold">{result.duration}</p>
                            {(() => {
                              const status = getDurationStatus(result.duration, result.status);
                              if (!status) return null;
                              return (
                                <span className={`text-[10px] md:text-[11px] px-2.5 py-0.5 rounded-md border font-bold tracking-widest leading-relaxed whitespace-nowrap ${status.style}`}>
                                  {status.text}
                                </span>
                              );
                            })()}
                          </div>
                       </div>
                       <div className="space-y-3 md:space-y-4 relative z-10">
                          <span className="text-[10px] md:text-[11px] text-[#8B7355] uppercase tracking-[0.2em] leading-none block font-bold">授权经营范围</span>
                          <p className="text-[13px] md:text-[15px] text-[#2C2A29] leading-[2] md:leading-[1.9] font-medium opacity-80 whitespace-pre-wrap break-words">
                            {result.scope?.replace(/\*\*/g, '')}
                          </p>
                       </div>
                     </div>
                  </div>
                </div>
              ) : null}
              </div>
              {results && results.length > 1 && !error && (
                <>
                  <button 
                    onClick={() => setCurrentIndex(Math.max(0, currentIndex - 1))}
                    disabled={currentIndex === 0}
                    className="absolute top-1/2 left-3 md:-left-16 -translate-y-1/2 flex items-center justify-center w-10 h-10 md:w-12 md:h-12 bg-white/80 backdrop-blur-md text-[#8B7355] disabled:opacity-0 disabled:pointer-events-none hover:text-[#2C2A29] hover:bg-white rounded-full shadow-lg border border-slate-200/50 transition-all z-[60]"
                  >
                    <ChevronLeft className="w-5 h-5 md:w-6 md:h-6 -ml-0.5" />
                  </button>
                  <button 
                    onClick={() => setCurrentIndex(Math.min(results.length - 1, currentIndex + 1))}
                    disabled={currentIndex === results.length - 1}
                    className="absolute top-1/2 right-3 md:-right-16 -translate-y-1/2 flex items-center justify-center w-10 h-10 md:w-12 md:h-12 bg-white/80 backdrop-blur-md text-[#8B7355] disabled:opacity-0 disabled:pointer-events-none hover:text-[#2C2A29] hover:bg-white rounded-full shadow-lg border border-slate-200/50 transition-all z-[60]"
                  >
                    <ChevronRight className="w-5 h-5 md:w-6 md:h-6 -mr-0.5" />
                  </button>
                </>
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
               onClick={() => { setShowReportModal(false); setEvidenceFile(null); }}
               className="absolute inset-0 bg-slate-900/40 backdrop-blur-md"
            />
            <motion.div 
               initial={{ opacity: 0, scale: 0.98, y: 10 }}
               animate={{ opacity: 1, scale: 1, y: 0 }}
               exit={{ opacity: 0, scale: 0.98, y: 10 }}
               className="relative w-full max-w-xl bg-white rounded-[24px] md:rounded-[32px] shadow-2xl p-6 md:p-14 overflow-hidden"
            >
              <div className="absolute top-4 right-4 md:top-6 md:right-6">
                <button 
                  onClick={() => { setShowReportModal(false); setEvidenceFile(null); }}
                  className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-50 text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                >
                  <X size={16} strokeWidth={2.5} />
                </button>
              </div>

              <div className="text-center mb-10 pt-2">
                 <img src="/NIHPLOD-logo.svg" alt="Auth" className="h-[34px] mx-auto mb-7" />
                 <h2 className="text-xl font-extrabold text-slate-900 tracking-[0.1em]">官方维权申诉与核查</h2>
              </div>

              <div className="space-y-6">
                 <div className="space-y-2">
                    <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest ml-1">涉嫌侵权描述</label>
                    <textarea 
                       placeholder="请简要描述您的维权申诉内容，我们将进行后台核查..."
                       className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-5 text-sm outline-none focus:border-red-200 focus:ring-4 focus:ring-red-500/5 transition-all h-32 resize-none"
                    />
                 </div>
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
                    <div className="space-y-2">
                       <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest ml-1">涉嫌违规渠道/商铺</label>
                       <input 
                          type="text" placeholder="如: 天猫 XXX 旗舰店"
                          className="w-full bg-slate-50 border border-slate-100 rounded-xl p-4 text-sm outline-none focus:border-red-200 focus:ring-4 focus:ring-red-500/5 transition-all"
                       />
                    </div>
                    <div className="space-y-2">
                       <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest ml-1">证据图片 (可选)</label>
                       <label className="w-full aspect-square md:aspect-auto md:h-[54px] bg-slate-50 border border-dashed border-slate-200 rounded-xl flex items-center justify-center text-slate-300 hover:text-slate-400 hover:border-slate-300 transition-all cursor-pointer relative overflow-hidden group">
                          <input 
                            type="file" 
                            accept="image/*" 
                            className="hidden" 
                            onChange={(e) => {
                              if (e.target.files && e.target.files[0]) {
                                setEvidenceFile(e.target.files[0]);
                              }
                            }}
                          />
                          {evidenceFile ? (
                            <div className="flex items-center justify-center gap-2 px-4 w-full">
                               <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                               <span className="text-xs text-slate-600 truncate">{evidenceFile.name}</span>
                            </div>
                          ) : (
                            <Camera className="w-5 h-5 group-hover:scale-110 transition-transform" />
                          )}
                       </label>
                    </div>
                 </div>
                 <button 
                   onClick={handleReportSubmit}
                   disabled={isSubmittingReport || reportSuccess}
                   className="w-full bg-[#8B7355]/10 text-[#8B7355] border border-[#8B7355]/40 rounded-xl py-3.5 font-bold tracking-widest text-[13px] hover:bg-[#8B7355]/20 hover:border-[#8B7355]/70 active:scale-[0.98] mt-6 flex items-center justify-center gap-2 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed">
                    {isSubmittingReport ? (
                      <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin"></div>
                    ) : reportSuccess ? (
                      <><CheckCircle2 className="w-4 h-4" /> 已收到您的请求</>
                    ) : (
                      <><ShieldAlert className="w-4 h-4 opacity-80" /> 提交核查请求</>
                    )}
                 </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* 二维码扫描模态框 */}
      <AnimatePresence>
        {showScanner && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-6">
            <motion.div 
               initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
               onClick={handleCloseScanner}
               className="absolute inset-0 bg-slate-900/40 backdrop-blur-md"
            />
            <motion.div 
               initial={{ opacity: 0, scale: 0.98, y: 10 }}
               animate={{ opacity: 1, scale: 1, y: 0 }}
               exit={{ opacity: 0, scale: 0.98, y: 10 }}
               className="relative w-full max-w-md bg-white rounded-[24px] md:rounded-[32px] shadow-2xl p-6 md:p-8 overflow-hidden"
            >
              <div className="absolute top-4 right-4 md:top-6 md:right-6">
                <button 
                  onClick={handleCloseScanner}
                  className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-50 text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                >
                  <X size={16} strokeWidth={2.5} />
                </button>
              </div>

              <div className="text-center mb-6 pt-2">
                 <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-700 mx-auto mb-6">
                    <QrCode size={24} />
                 </div>
                 <h2 className="text-xl font-extrabold text-slate-900 tracking-[0.1em]">扫描二维码验证</h2>
                 <p className="text-xs text-slate-500 mt-2">将摄像头对准授权书上的二维码</p>
              </div>

              {isScanning && (
                <div className="text-center py-4">
                  <RefreshCw className="w-5 h-5 animate-spin mx-auto text-slate-400 mb-2" />
                  <p className="text-sm text-slate-600">正在验证...</p>
                </div>
              )}

              <div id="qr-scanner-container" className="mb-6" style={{ width: '100%' }}></div>

              {scanError && (
                <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-xl">
                  <p className="text-xs text-red-700">{scanError}</p>
                </div>
              )}

              <button 
                onClick={handleCloseScanner}
                className="w-full mt-4 bg-slate-100 text-slate-700 h-11 rounded-xl text-sm font-semibold hover:bg-slate-200 transition-all"
              >
                关闭
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* 页脚 */}
      <footer className="w-full max-w-7xl px-6 md:px-12 py-8 md:py-10 flex flex-col md:flex-row justify-between items-center gap-6 shrink-0 border-t border-slate-100/30">
         <p className="text-[10px] md:text-[11px] font-normal text-slate-400 md:text-slate-300 tracking-normal antialiased order-3 md:order-1">
           &copy; 2026 NIHPLOD. All rights reserved
         </p>
          <div className="flex flex-wrap gap-4 md:gap-12 text-[10px] md:text-[11px] font-bold text-slate-500 md:text-slate-400 uppercase tracking-[0.05em] md:tracking-[0.1em] justify-center md:justify-end order-1 md:order-3 w-full md:w-auto">
             {/* 官方维权申诉 */}
             <button 
               onClick={() => { setShowReportModal(true); setEvidenceFile(null); }} 
               className="text-red-500/70 hover:text-red-600 active:text-red-700 cursor-pointer transition-colors flex items-center gap-2 whitespace-nowrap"
             >
               <Megaphone className="w-3.5 h-3.5" /> 官方维权申诉
            </button>

            {/* 用户区域 */}
            {loggedInUser ? (
              <button
                onClick={handleLoginClick}
                className="text-slate-600 flex items-center gap-2 whitespace-nowrap cursor-pointer hover:text-slate-900 active:text-slate-700 transition-colors"
              >
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
                <span className="hidden sm:inline max-w-[60px] truncate">{loggedInUser.phone || "已登陆"}</span>
              </button>
            ) : (
              <button 
                onClick={handleLoginClick} 
                className="cursor-pointer hover:text-slate-900 active:text-slate-700 transition-colors whitespace-nowrap"
              >
                统一登陆
              </button>
            )}

            {/* 服务条款 */}
            <button 
              onClick={() => setShowLegalModal({ isOpen: true, type: "service" })} 
              className="hover:text-slate-900 active:text-slate-700 cursor-pointer transition-colors whitespace-nowrap"
            >
              服务协议
            </button>

            {/* 隐私声明 */}
            <button 
              onClick={() => setShowLegalModal({ isOpen: true, type: "privacy" })} 
              className="hover:text-slate-900 active:text-slate-700 cursor-pointer transition-colors whitespace-nowrap"
            >
              隐私声明
            </button>
         </div>
      </footer>
      <LoginModal 
        isOpen={showLoginModal} 
        onClose={() => setShowLoginModal(false)} 
        onShowResetPassword={() => {
          setShowLoginModal(false);
          setShowResetPasswordModal(true);
        }}
      />
      <LegalModal isOpen={showLegalModal.isOpen} type={showLegalModal.type} onClose={() => setShowLegalModal({ ...showLegalModal, isOpen: false })} />
      <DealerModalPanel 
        isOpen={showDealerModal} 
        onClose={() => setShowDealerModal(false)}
        onOpenResetPassword={() => {
          setShowDealerModal(false);
          setShowResetPasswordModal(true);
        }}
      />
      <ResetPasswordModal 
        isOpen={showResetPasswordModal} 
        onClose={() => setShowResetPasswordModal(false)}
        onSuccess={() => {
          // 重置密码成功后，如果是经销商，打开经销商面板
          const userStr = sessionStorage.getItem('user');
          if (userStr) {
            try {
              const user = JSON.parse(userStr);
              if (user.role === 'DEALER') {
                setShowDealerModal(true);
              }
            } catch (e) {
              console.error('Failed to parse user:', e);
            }
          }
        }}
      />
    </main>
  );
}

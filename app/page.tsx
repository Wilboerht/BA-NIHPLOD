"use client";

import { useState, useEffect, useRef } from "react";
import { Search, ShieldAlert, Download, Globe, RefreshCw, CheckCircle2, ArrowRight, X, Megaphone, Camera, AlertTriangle, QrCode, ChevronLeft, ChevronRight, Building2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import LoginModal from "@/components/LoginModal";
import LegalModal from "@/components/LegalModal";
import DealerModalPanel from "@/components/DealerModalPanel";
import ResetPasswordModal from "@/components/ResetPasswordModal";
import { verifyCertificateAction, submitComplaintAction, type CertificateVerifyResult } from "@/app/actions";
import { Html5Qrcode } from "html5-qrcode";

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
  
  const [isSubmittingReport, setIsSubmittingReport] = useState(false);
  const [reportSuccess, setReportSuccess] = useState(false);
  const [reportDesc, setReportDesc] = useState("");
  const [reportChannel, setReportChannel] = useState("");

  const handleReportSubmit = async () => {
    if (!reportDesc.trim()) {
      alert("请填写维权描述");
      return;
    }
    
    setIsSubmittingReport(true);
    
    try {
      let evidence_url = "";
      
      // 1. 如果有上传文件，先处理上传
      if (evidenceFile) {
        const formData = new FormData();
        formData.append('file', evidenceFile);
        
        const uploadResponse = await fetch('/api/upload', {
          method: 'POST',
          body: formData
        });
        
        if (!uploadResponse.ok) {
          const uploadData = await uploadResponse.json();
          throw new Error(uploadData.error || "图片上传失败");
        }
        
        const { url } = await uploadResponse.json();
        evidence_url = url;
      }
      
      // 2. 提交数据
      const res = await submitComplaintAction({
        description: reportDesc,
        channel: reportChannel,
        evidence_image_url: evidence_url
      });
      
      if (!res.success) throw new Error(res.error);
      
      setReportSuccess(true);
      // 成功展示2秒后自动清空数据并关闭弹窗
      setTimeout(() => {
        setReportSuccess(false);
        setShowReportModal(false);
        setEvidenceFile(null);
        setReportDesc("");
        setReportChannel("");
      }, 2000);
    } catch (err: unknown) {
      alert("提交失败：" + (err instanceof Error ? err.message : "提交失败"));
    } finally {
      setIsSubmittingReport(false);
    }
  };
  
  // 二维码扫描相关状态
  const [showScanner, setShowScanner] = useState(false);
  const [scannerReady, setScannerReady] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [scannerTrigger, setScannerTrigger] = useState(0);

  // 页面加载时检查登录状态（通过 JWT Cookie）
  useEffect(() => {
    const checkLoginStatus = async () => {
      try {
        const res = await fetch('/api/auth/me');
        if (res.ok) {
          const data = await res.json();
          const user = data.user as UserSession;

          // 如果是管理员，重定向到 workbench
          if (user?.role === "SUPER_ADMIN" || user?.role === "AUDITOR" || user?.role === "MANAGER" || user?.role === "PROJECT_MANAGER") {
            window.location.href = "/workbench";
            return;
          }

          // 如果是经销商，设置状态但不自动打开面板
          if (user?.role === "DEALER") {
            setLoggedInUser(user);
          }
        }
      } catch (e) {
        console.error("Failed to check login status:", e);
      }
      setIsPageLoading(false);
    };

    checkLoginStatus();
  }, []);

  // 当产生扫描错误时，开启独立生命周期的 3 秒自动回收机制
  useEffect(() => {
    if (!scanError) return;
    const timer = setTimeout(() => setScanError(null), 3000);
    return () => clearTimeout(timer);
  }, [scanError]);

  // 初始化和清理扫描器
  useEffect(() => {
    let html5QrCode: Html5Qrcode | null = null;

    if (showScanner) {
      const startScanner = async () => {
        try {
          html5QrCode = new Html5Qrcode("qr-scanner-container");
          scannerRef.current = html5QrCode;
          
          await html5QrCode.start(
            { facingMode: "environment" }, 
            {
              fps: 10,
              qrbox: { width: 150, height: 150 },
              aspectRatio: 1
            },
            (decodedText: string) => {
              // 扫描成功
              setScanError(null);
              setIsScanning(true);
              
              // 从 URL 中提取证书编号
              let certNumber = decodedText;
              try {
                const urlParams = new URL(decodedText, "http://localhost").searchParams;
                if (urlParams.has("cert")) {
                  certNumber = urlParams.get("cert") || decodedText;
                }
              } catch (e) {
                // Not a URL, use raw text
              }
              
              // 停止扫描并执行验证
              if (html5QrCode && html5QrCode.isScanning) {
                html5QrCode.stop().then(() => {
                  handleScanVerify(certNumber);
                }).catch(err => {
                  console.error("Failed to stop scanner:", err);
                  handleScanVerify(certNumber);
                });
              } else {
                handleScanVerify(certNumber);
              }
            },
            (_error: unknown) => {
              // 扫描中的反馈，忽略
            }
          );
          setScannerReady(true);
        } catch (err: unknown) {
          console.error("Failed to start scanner:", err);
          const errStr = err instanceof Error ? err.message : String(err);
          if (errStr.includes("NotAllowedError") || errStr.includes("PermissionDenied")) {
            setScanError("请在浏览器设置中允许摄像头权限以进行扫描。");
          } else {
            setScanError("无法启动摄像头，请检查设备连接。");
          }
        }
      };

      startScanner();
    }

    return () => {
      if (html5QrCode) {
        if (html5QrCode.isScanning) {
          html5QrCode.stop().catch(err => console.error("Failed to stop scanner in cleanup:", err));
        }
        scannerRef.current = null;
        setScannerReady(false);
      }
    };
  }, [showScanner, scannerTrigger]);

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

  // 从相册等文件扫描
  const handleFileScan = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsScanning(true);
    setScanError(null);

    // 如果当前正在进行摄像头扫描，先停止
    if (scannerRef.current && scannerRef.current.isScanning) {
      try {
        await scannerRef.current.stop();
      } catch (err) {
        console.warn("Failed to stop camera scanner before file scan", err);
      }
    }

    const html5QrCode = scannerRef.current || new Html5Qrcode("qr-scanner-container");
    
    try {
      const decodedText = await html5QrCode.scanFile(file, true);
      
      // 提取证书编号逻辑
      let certNumber = decodedText;
      try {
        const urlParams = new URL(decodedText, "http://localhost").searchParams;
        if (urlParams.has("cert")) {
          certNumber = urlParams.get("cert") || decodedText;
        }
      } catch (e) {
        // 非 URL
      }
      
      handleScanVerify(certNumber);
    } catch (err) {
      console.error("File scan error:", err);
      setIsScanning(false);
      setScanError("未能在图片中识别到有效的授权二维码。");
      
      // 如果识别失败，重新启动摄像头（如果模态框还开着）
      if (showScanner) {
        const restartScanner = async () => {
          try {
            const html5QrCode = scannerRef.current || new Html5Qrcode("qr-scanner-container");
            scannerRef.current = html5QrCode;
            await html5QrCode.start(
              { facingMode: "environment" }, 
              { fps: 10, qrbox: { width: 150, height: 150 }, aspectRatio: 1 },
              (decodedText: string) => {
                // ... 重复之前的成功逻辑 ...
                // 为了避免代码重复，这里其实可以提取出 startScanner 函数，但为了保持逻辑紧凑先这样处理
                // 实际上 useEffect 里的 startScanner 是闭包，这里无法直接调用
                // 简单起见，提示用户手动刷新或这里由于 useEffect 依赖 [showScanner]，
                // 我们可以通过一个 state 触发 useEffect 重新执行。
                setScannerTrigger(prev => prev + 1);
              },
              () => {}
            );
          } catch (e) {
            console.error("Failed to restart scanner:", e);
          }
        };
        // 这里最好的做法是重新触发 useEffect
        setScannerTrigger(prev => prev + 1);
      }
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // 关闭扫描器
  const handleCloseScanner = () => {
    if (scannerRef.current) {
      const scanner = scannerRef.current;
      if (scanner.isScanning) {
        scanner.stop().catch(err => console.error("Failed to stop scanner:", err));
      }
      scannerRef.current = null;
    }
    setShowScanner(false);
    setScannerReady(false);
    setScanError(null);
  };

  // 检查是否有经销商用户登录，当登录模态框从打开变为关闭时（登陆完成）才打开面板
  useEffect(() => {
    // 只在登陆模态框从 true 变为 false 时执行（即刚完成登陆）
    if (prevShowLoginModalRef.current && !showLoginModal) {
      fetch('/api/auth/me')
        .then(res => res.ok ? res.json() : null)
        .then(data => {
          if (data?.user?.role === "DEALER") {
            setLoggedInUser(data.user);
            setShowDealerModal(true);
          }
        })
        .catch(e => console.error("Failed to check dealer login:", e));
    }
    // 更新 ref 值用于下一次比较
    prevShowLoginModalRef.current = showLoginModal;
  }, [showLoginModal]);

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch (e) {
      console.error('Logout error:', e);
    }
    setLoggedInUser(null);
    setShowDealerModal(false);
    window.location.href = "/";
  };

  const handleDealerLoginClick = () => {
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
           className="absolute w-[750px] h-[750px] md:w-[1200px] md:h-[1200px] rounded-full pointer-events-none blur-[140px] md:blur-[180px] z-0" 
           style={{ background: "radial-gradient(circle, #8B7355 0%, #8B7355 8%, transparent 65%)" }}
           animate={{
              x: ['5vw', '55vw', '15vw', '60vw', '5vw'],
              y: ['10vh', '45vh', '80vh', '30vh', '10vh'],
              scale: [1, 1.25, 0.85, 1.15, 1],
              opacity: [0.15, 0.3, 0.2, 0.32, 0.15],
              scaleX: [1, 1.4, 0.7, 1.2, 1],
              scaleY: [1, 0.6, 1.3, 0.8, 1],
           }}
           transition={{ duration: 50, repeat: Infinity, ease: "linear" }}
      />
      {/* 2. 暖亚麻 - 逆向漂移 (Warm Linen - Inverse Flow) */}
      <motion.div 
           className="absolute w-[650px] h-[650px] md:w-[1100px] md:h-[1100px] rounded-full pointer-events-none blur-[130px] md:blur-[170px] z-0" 
           style={{ background: "radial-gradient(circle, #E5DED4 0%, #D4BC9B 10%, transparent 68%)" }}
           animate={{
              x: ['70vw', '20vw', '60vw', '15vw', '70vw'],
              y: ['15vh', '70vh', '25vh', '60vh', '15vh'],
              scale: [0.9, 1.15, 1.05, 0.8, 0.9],
              opacity: [0.18, 0.35, 0.25, 0.4, 0.18],
              scaleX: [1.1, 0.8, 1.3, 0.9, 1.1],
              scaleY: [0.8, 1.2, 0.75, 1.15, 0.8],
           }}
           transition={{ duration: 65, repeat: Infinity, ease: "linear" }}
      />
      {/* 3. 香槟金 - 交叉扰动 (Champagne Gold - Cross-current Flow) */}
      <motion.div 
           className="absolute w-[550px] h-[550px] md:w-[950px] md:h-[950px] rounded-full pointer-events-none blur-[100px] md:blur-[150px] z-0" 
           style={{ background: "radial-gradient(circle, #F7E7CE 0%, #F1E5AC 12%, transparent 65%)" }}
           animate={{
              x: ['10vw', '60vw', '20vw', '55vw', '10vw'],
              y: ['75vh', '20vh', '40vh', '70vh', '75vh'],
              scale: [0.85, 1.25, 0.9, 1.2, 0.85],
              opacity: [0.2, 0.38, 0.28, 0.42, 0.2],
              scaleX: [1.2, 0.85, 1.1, 0.75, 1.2],
              scaleY: [0.75, 1.2, 0.9, 1.25, 0.75],
           }}
           transition={{ duration: 42, repeat: Infinity, ease: "linear" }}
      />
      {/* 4. 淡玫瑰金 - 对角漂移 (Rose Gold - Diagonal Flow) */}
      <motion.div 
           className="absolute w-[500px] h-[500px] md:w-[850px] md:h-[850px] rounded-full pointer-events-none blur-[110px] md:blur-[160px] z-0" 
           style={{ background: "radial-gradient(circle, #E5D0C8 0%, #C9A89A 10%, transparent 68%)" }}
           animate={{
              x: ['65vw', '15vw', '55vw', '20vw', '65vw'],
              y: ['70vh', '25vh', '65vh', '80vh', '70vh'],
              scale: [0.8, 1.1, 0.95, 1.15, 0.8],
              opacity: [0.12, 0.22, 0.15, 0.25, 0.12],
              scaleX: [0.9, 1.3, 1, 0.85, 0.9],
              scaleY: [1.1, 0.7, 1.2, 1.05, 1.1],
           }}
           transition={{ duration: 55, repeat: Infinity, ease: "linear" }}
      />
      {/* 5. 象牙白 - 中心环绕 (Ivory Cream - Orbit Flow) */}
      <motion.div 
           className="absolute w-[600px] h-[600px] md:w-[1000px] md:h-[1000px] rounded-full pointer-events-none blur-[120px] md:blur-[170px] z-0" 
           style={{ background: "radial-gradient(circle, #F0EBE3 0%, #DDD5C8 12%, transparent 65%)" }}
           animate={{
              x: ['50vw', '25vw', '75vw', '30vw', '50vw'],
              y: ['50vh', '25vh', '50vh', '75vh', '50vh'],
              scale: [1, 0.85, 1.1, 0.9, 1],
              opacity: [0.18, 0.32, 0.22, 0.35, 0.18],
              scaleX: [1, 0.75, 1.15, 1.05, 1],
              scaleY: [1, 1.25, 0.8, 1.1, 1],
           }}
           transition={{ duration: 38, repeat: Infinity, ease: "linear" }}
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
            className="group flex items-center gap-1.5 md:gap-2 px-3 md:px-4 py-1.5 md:py-2 rounded-full bg-[#8B7355]/5 hover:bg-[#8B7355]/10 border border-[#8B7355]/10 hover:border-[#8B7355]/20 text-xs md:text-[13px] font-semibold tracking-[0.05em] text-[#8B7355] hover:text-[#6B5346] transition-all"
         >
            <Building2 className="w-3.5 h-3.5 md:w-4 md:h-4 opacity-70 group-hover:opacity-100 transition-opacity" />
            <span className="hidden sm:inline">旎柏官网</span>
            <span className="sm:hidden">旎柏官网</span>
            <svg className="w-3 h-3 opacity-60 group-hover:opacity-100 transition-opacity duration-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M7 17L17 7"/><path d="M7 7h10v10"/></svg>
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
                  disabled={isSearching || !query.trim()}
                  className="relative flex items-center justify-center gap-1.5 h-10 md:h-[48px] px-5 md:px-7 rounded-full bg-[#8B7355] hover:bg-[#6B5346] text-white text-[13px] md:text-sm active:scale-[0.96] transition-all duration-200 shadow-md shadow-[#8B7355]/25 hover:shadow-lg hover:shadow-[#8B7355]/35 disabled:opacity-50 disabled:cursor-not-allowed font-semibold tracking-widest uppercase"
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

            {/* 扫码按钮 */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3 }}
              className="mt-5 flex justify-center"
            >
              <button
                type="button"
                onClick={() => setShowScanner(true)}
                disabled={isSearching}
                className="inline-flex items-center gap-2 text-[13px] text-[#8B7355] hover:text-[#6B5346] transition-colors tracking-widest disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <QrCode className="w-4 h-4" />
                <span>扫描二维码验证</span>
              </button>
            </motion.div>
            
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }}
              transition={{ delay: 0.4 }}
              className="md:hidden mt-14 flex justify-center"
            >
              <Link
                href="https://nihplod.cn"
                target="_blank"
                className="group flex items-center gap-1.5 px-4 py-2 rounded-full bg-[#8B7355]/5 hover:bg-[#8B7355]/10 border border-[#8B7355]/10 hover:border-[#8B7355]/20 text-xs font-semibold tracking-[0.05em] text-[#8B7355]/70 hover:text-[#8B7355] transition-all"
              >
                <Building2 className="w-3.5 h-3.5 opacity-70 group-hover:opacity-100 transition-opacity" />
                旎柏官网
                <svg className="w-3 h-3 opacity-60 group-hover:opacity-100 transition-opacity duration-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M7 17L17 7"/><path d="M7 7h10v10"/></svg>
              </Link>
            </motion.div>
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
              <div className="relative w-full bg-[#FDFBF7] border border-[#E8E0D5]/40 rounded-[24px] md:rounded-[32px] shadow-2xl p-6 md:p-14 overflow-hidden">
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
                  <img src="/NIHPLOD-logo.svg" alt="NIHPLOD" className="h-10 w-auto mb-6 mx-auto" />
                  <div className="space-y-4 text-center">
                     <div className="space-y-4 md:space-y-5">
                        <p className="text-lg md:text-[22px] text-[#2C2A29] font-bold tracking-wide leading-snug px-2 md:px-4">{error}</p>
                        <p className="text-[13px] md:text-[15px] text-[#8B7355]/80 leading-relaxed max-w-xl mx-auto px-0 md:px-4">
                          请核查您填写的检索信息是否准确无误。<br className="hidden md:block" />
                          为保障您的权益，如遇疑似未经官方授权的商业行为，请向我们提交反馈。
                        </p>
                     </div>
                      <button 
                        onClick={() => { setError(null); setShowReportModal(true); setEvidenceFile(null); }}
                        className="bg-[#9B3D3B]/8 text-[#9B3D3B] border border-[#9B3D3B]/20 px-8 py-3 rounded-xl text-sm hover:bg-[#9B3D3B]/15 hover:border-[#9B3D3B]/30 transition-all flex items-center justify-center gap-2 mx-auto tracking-[0.1em] mt-12 font-medium"
                      >
                        <AlertTriangle className="w-4 h-4" /> 官方维权申诉与核查
                      </button>
                  </div>
                </div>
              ) : result ? (
                <div className="relative w-full flex flex-col">
                  <div className="flex flex-col space-y-8 md:space-y-10 relative z-10">
                    <div className="space-y-5 px-0">
                      <div className="flex items-center gap-1.5 md:gap-2 text-[#8B7355] text-[10px] md:text-[11px] font-bold tracking-[0.15em] md:tracking-[0.2em] bg-[#8B7355]/5 px-2.5 md:px-3 py-1.5 rounded-full border border-[#8B7355]/20 w-fit shadow-sm shadow-[#8B7355]/5">
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
               className="relative w-full max-w-xl bg-white rounded-[28px] shadow-2xl p-10 overflow-hidden"
            >
              <div className="absolute top-4 right-4 md:top-6 md:right-6">
                <button 
                  onClick={() => { setShowReportModal(false); setEvidenceFile(null); }}
                  className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-50 text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                >
                  <X size={16} strokeWidth={2.5} />
                </button>
              </div>

              <div className="text-center mb-6 pt-2 md:mb-10">
                 <img src="/NIHPLOD-logo.svg" alt="Auth" className="h-[34px] mx-auto mb-4 md:mb-7" />
                 <h2 className="text-xl font-extrabold text-slate-900 tracking-[0.1em]">官方维权申诉与核查</h2>
              </div>

              <div className="space-y-6">
                 <div className="space-y-2">
                    <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest ml-1">涉嫌侵权描述</label>
                    <textarea 
                       value={reportDesc}
                       onChange={(e) => setReportDesc(e.target.value)}
                       placeholder="请简要描述您的维权申诉内容，我们将进行后台核查..."
                       className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-5 text-sm outline-none focus:border-red-200 focus:ring-4 focus:ring-red-500/5 transition-all h-24 md:h-32 resize-none"
                    />
                 </div>
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
                    <div className="space-y-2">
                       <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest ml-1">涉嫌违规渠道/商铺</label>
                       <input 
                          type="text" 
                          value={reportChannel}
                          onChange={(e) => setReportChannel(e.target.value)}
                          placeholder="如: 天猫 XXX 旗舰店"
                          className="w-full bg-slate-50 border border-slate-100 rounded-xl p-4 text-sm outline-none focus:border-red-200 focus:ring-4 focus:ring-red-500/5 transition-all"
                       />
                    </div>
                    <div className="space-y-2">
                       <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest ml-1">证据图片 (可选)</label>
                       <label className="w-full h-[54px] bg-slate-50 border border-dashed border-slate-200 rounded-xl flex items-center justify-center text-slate-300 hover:text-slate-400 hover:border-slate-300 transition-all cursor-pointer relative overflow-hidden group">
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

            {/* 浮动错误提示 */}
            <AnimatePresence>
              {scanError && (
                <motion.div
                  initial={{ opacity: 0, y: -20, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -10, scale: 0.95 }}
                  className="absolute top-12 left-1/2 -translate-x-1/2 z-[100] bg-white text-slate-800 px-5 py-3 rounded-full shadow-[0_8px_30px_rgb(0,0,0,0.08)] border border-slate-100 flex items-center gap-3 text-xs md:text-[13px] font-bold tracking-widest whitespace-nowrap"
                >
                  <div className="w-6 h-6 rounded-full bg-red-50 flex items-center justify-center shrink-0">
                    <AlertTriangle className="w-[14px] h-[14px] text-red-500" />
                  </div>
                  {scanError}
                </motion.div>
              )}
            </AnimatePresence>
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
                 <img src="/NIHPLOD-logo.svg" alt="NIHPLOD" className="h-[34px] w-auto mx-auto mb-6" />
                 <h2 className="text-xl font-extrabold text-slate-900 tracking-[0.1em]">扫码验证</h2>
                 <p className="text-xs text-slate-500 mt-2">将摄像头对准授权书上的二维码</p>
              </div>

              <div className="relative mb-6 overflow-hidden rounded-2xl bg-slate-900 border border-slate-100 shadow-inner max-w-[240px] mx-auto">
                {(!scannerReady || isScanning) && !scanError && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center z-10 bg-white/90 backdrop-blur-sm">
                    <RefreshCw className="w-8 h-8 animate-spin text-[#8B7355] mb-4" />
                    <p className="text-xs text-[#8B7355] font-bold tracking-widest uppercase">
                      {isScanning ? "正在核验授权信息..." : "正在启动安全摄像头..."}
                    </p>
                  </div>
                )}
                <div id="qr-scanner-container" style={{ width: '100%', aspectRatio: '1/1' }}></div>
              </div>

              <div className="flex flex-col gap-4 mt-4">
                <div className="text-center">
                  <button 
                    onClick={() => fileInputRef.current?.click()}
                    className="inline-flex items-center gap-2 text-[10px] md:text-[11px] text-[#8B7355] font-black tracking-widest uppercase hover:text-black transition-all group"
                  >
                    <Download className="w-3.5 h-3.5 rotate-180 group-hover:-translate-y-0.5 transition-transform" />
                    <span>从相册选择图片扫描</span>
                  </button>
                  <input 
                    type="file" 
                    ref={fileInputRef} 
                    className="hidden" 
                    accept="image/*" 
                    onChange={handleFileScan} 
                  />
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* 页脚 */}
      <footer className="w-full max-w-7xl px-6 md:px-12 py-8 md:py-10 flex flex-col md:flex-row justify-between items-center gap-6 shrink-0 border-t border-slate-100/30">
         <div className="flex flex-col items-center md:items-start gap-1 order-3 md:order-1">
           <p className="text-[10px] md:text-[11px] font-normal text-slate-400 md:text-slate-300 tracking-normal antialiased">
             &copy; 2026 NIHPLOD. All rights reserved
           </p>
           <div className="flex items-center gap-2">
             <a
               href="https://beian.miit.gov.cn/"
               target="_blank"
               rel="noopener noreferrer"
               className="text-[10px] md:text-[11px] font-normal text-slate-400 md:text-slate-300 hover:text-slate-500 transition-colors tracking-normal antialiased"
             >
               沪ICP备2026014764号-1
             </a>
             <span className="text-[10px] md:text-[11px] text-slate-300">|</span>
             <a
               href="http://www.beian.gov.cn/portal/registerSystemInfo"
               target="_blank"
               rel="noopener noreferrer"
               className="flex items-center gap-1 text-[10px] md:text-[11px] font-normal text-slate-400 md:text-slate-300 hover:text-slate-500 transition-colors tracking-normal antialiased"
             >
               <img src="/assets/beian.webp" alt="公安网备" className="w-3 h-3" />
               沪公网安备31010702010178号
             </a>
           </div>
         </div>
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
                onClick={handleDealerLoginClick}
                className="text-slate-600 flex items-center gap-2 whitespace-nowrap cursor-pointer hover:text-slate-900 active:text-slate-700 transition-colors"
              >
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
                <span className="hidden sm:inline max-w-[60px] truncate">{loggedInUser.phone || "已登陆"}</span>
              </button>
            ) : (
              <>
                <button 
                  onClick={handleDealerLoginClick} 
                  className="cursor-pointer hover:text-slate-900 active:text-slate-700 transition-colors whitespace-nowrap"
                >
                  经销商登录
                </button>
                <a 
                  href="/admin/login"
                  className="cursor-pointer hover:text-slate-900 active:text-slate-700 transition-colors whitespace-nowrap"
                >
                  管理员入口
                </a>
              </>
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
        onSuccess={async () => {
          // 重置密码成功后，如果是经销商，打开经销商面板
          try {
            const res = await fetch('/api/auth/me');
            if (res.ok) {
              const data = await res.json();
              if (data.user?.role === 'DEALER') {
                setShowDealerModal(true);
              }
            }
          } catch (e) {
            console.error('Failed to check user after reset:', e);
          }
        }}
      />
    </main>
  );
}

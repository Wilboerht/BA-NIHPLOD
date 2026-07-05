"use client";

import { useState, useEffect, useRef } from "react";
import { Search, ShieldAlert, Globe, RefreshCw, CheckCircle2, X, Camera, AlertTriangle, QrCode, ChevronLeft, ChevronRight, Building2, Trash2, ExternalLink, Upload } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import Image from "next/image";
import LoginModal from "@/components/LoginModal";
import LegalModal from "@/components/LegalModal";
import ResetPasswordModal from "@/components/ResetPasswordModal";
import { verifyCertificateAction, submitComplaintAction, type CertificateVerifyResult } from "@/app/actions";
import { useToast } from "@/hooks/useToast";
import { type UserSession } from "@/types";
import { BRAND_NAME_CN } from "@/lib/config";
import { fetchWithTimeout } from "@/lib/fetch";
import { Html5Qrcode } from "html5-qrcode";

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

export default function HomeClient() {
  const { toast } = useToast();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CertificateVerifyResult[] | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const result = results ? results[currentIndex] : null;
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showReportModal, setShowReportModal] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [showResetPasswordModal, setShowResetPasswordModal] = useState(false);
  const [showLegalModal, setShowLegalModal] = useState<{ isOpen: boolean; type: "service" | "privacy" }>({ isOpen: false, type: "service" });
  const [evidenceFiles, setEvidenceFiles] = useState<File[]>([]);
  const evidencePreviewUrls = useRef<Map<string, string>>(new Map());

  // 响应式 placeholder：手机端简短、PC 端完整
  const [placeholderText, setPlaceholderText] = useState("输入证书编号、店铺或公司名称");
  useEffect(() => {
    const update = () => setPlaceholderText(window.innerWidth < 768 ? "请输入查询信息" : "输入证书编号、店铺或公司名称");
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  // 清理 blob URL 防止内存泄漏
  useEffect(() => {
    return () => {
      evidencePreviewUrls.current.forEach((url) => URL.revokeObjectURL(url));
      evidencePreviewUrls.current.clear();
    };
  }, []);
  
  const [isSubmittingReport, setIsSubmittingReport] = useState(false);
  const [reportSuccess, setReportSuccess] = useState(false);
  const [reportDesc, setReportDesc] = useState("");
  const [reportChannel, setReportChannel] = useState("");
  const [reportContact, setReportContact] = useState("");

  const resetReportForm = () => {
    setReportSuccess(false);
    setEvidenceFiles([]);
    setReportDesc("");
    setReportChannel("");
    setReportContact("");
  };

  const handleReportSubmit = async () => {
    if (!reportDesc.trim()) {
      toast({ message: "请填写维权描述", type: "warning" });
      return;
    }
    if (!reportContact.trim()) {
      toast({ message: "请填写联系方式", type: "warning" });
      return;
    }
    
    setIsSubmittingReport(true);
    
    try {
      const evidence_urls: string[] = [];
      
      // 1. 批量上传文件（使用匿名公开上传接口，并发上传）
      if (evidenceFiles.length > 0) {
        const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
        const MAX_FILE_SIZE = 5 * 1024 * 1024;
        
        // 预校验所有文件
        for (const file of evidenceFiles) {
          if (!ALLOWED_TYPES.includes(file.type)) {
            throw new Error(`「${file.name}」格式不支持，仅支持 JPG/PNG/GIF/WebP`);
          }
          if (file.size > MAX_FILE_SIZE) {
            throw new Error(`「${file.name}」超过 5MB 限制`);
          }
        }
        
        // 并发上传
        const uploadResults = await Promise.all(
          evidenceFiles.map(async (file) => {
            const formData = new FormData();
            formData.append('file', file);
            
            const uploadResponse = await fetchWithTimeout('/api/upload/public', {
              method: 'POST',
              body: formData
            });
            
            if (!uploadResponse.ok) {
              const uploadData = await uploadResponse.json();
              throw new Error(uploadData.error || `「${file.name}」上传失败`);
            }
            
            const { url } = await uploadResponse.json();
            return url as string;
          })
        );
        
        evidence_urls.push(...uploadResults);
      }
      
      // 2. 提交数据
      const res = await submitComplaintAction({
        description: reportDesc,
        channel: reportChannel || undefined,
        contact_info: reportContact || undefined,
        evidence_image_urls: evidence_urls.length > 0 ? evidence_urls : undefined
      });
      
      if (!res.success) throw new Error(res.error);
      
      setReportSuccess(true);
      // 成功展示2秒后自动清空数据并关闭弹窗
      setTimeout(() => {
        setShowReportModal(false);
        resetReportForm();
      }, 2000);
    } catch (err: unknown) {
      toast({ message: "提交失败：" + (err instanceof Error ? err.message : "提交失败"), type: "error" });
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

  // 监听侧边栏触发的维权申诉事件
  useEffect(() => {
    const reportHandler = () => {
      setShowReportModal(true);
      setEvidenceFiles([]);
    };
    const scannerHandler = () => setShowScanner(true);
    window.addEventListener('open-report-modal', reportHandler);
    window.addEventListener('open-scanner-modal', scannerHandler);
    return () => {
      window.removeEventListener('open-report-modal', reportHandler);
      window.removeEventListener('open-scanner-modal', scannerHandler);
    };
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
              } catch (_e) {
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
            setScanError("摄像头权限未开启");
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      await handleCloseScanner();
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
      } catch (_e) {
        // 非 URL
      }
      
      handleScanVerify(certNumber);
    } catch (err) {
      console.error("File scan error:", err);
      setIsScanning(false);
      setScanError("未能在图片中识别到有效的授权二维码。");
      
      // 如果识别失败，重新启动摄像头（如果模态框还开着）
      if (showScanner) {
        // 重新触发 useEffect 来启动扫描器
        setScannerTrigger(prev => prev + 1);
      }
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // 关闭扫描器
  const handleCloseScanner = async () => {
    if (scannerRef.current) {
      const scanner = scannerRef.current;
      if (scanner.isScanning) {
        try {
          await scanner.stop();
        } catch (err) {
          console.error("Failed to stop scanner:", err);
        }
      }
      scannerRef.current = null;
    }
    setShowScanner(false);
    setScannerReady(false);
    setScanError(null);
    setIsScanning(false);
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
    <main className="relative h-[calc(100dvh-68px)] md:h-[calc(100dvh-92px)] w-full flex flex-col justify-between items-center bg-[#F2EDE3] overflow-hidden font-sans">

      {/* 核心内容区 */}
      <div className="flex-1 flex flex-col items-center justify-center w-full max-w-4xl px-5 md:px-8 relative z-10">
        <div className="w-full flex flex-col items-center">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center space-y-4 md:space-y-6 mb-4 md:mb-6"
          >
            <div className="space-y-4 md:space-y-6">
              <h1 className="text-[36px] sm:text-[44px] md:text-[52px] font-normal leading-[1.1] tracking-tight text-[#1A1A1A]">
                授权资质官方核查
              </h1>
              <p className="text-[#5C5855]/90 text-sm sm:text-base max-w-xl mx-auto leading-[1.9] tracking-wide font-light">
                输入授权证书编号 (SN)、店铺名称或公司名称，<br className="hidden md:inline" /> 核实官方资质及合法经营区域。
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
              className="group relative flex items-center bg-white/80 border border-slate-200 rounded-[28px] md:rounded-[32px] shadow-[0_4px_16px_rgba(0,0,0,0.06)] focus-within:border-[#8B7355]/30 focus-within:shadow-[0_8px_24px_rgba(0,0,0,0.08)] transition-all duration-300 overflow-hidden"
            >
              <div className="flex-1 flex items-center pl-4 py-2 md:pl-8 md:py-3 gap-2.5">
                <Search className="w-4 h-4 md:w-5 md:h-5 flex-shrink-0 text-slate-500 group-focus-within:text-[#8B7355] transition-colors" />
                <input 
                  type="text" 
                  aria-label="搜索授权证书"
                  placeholder={placeholderText} 
                  className="w-full bg-transparent border-none outline-none p-0 text-[#2C2A29] text-[15px] md:text-base placeholder:text-sm md:placeholder:text-base placeholder:text-[#8B7355]/45 hover:placeholder:text-[#8B7355]/60 focus:ring-0 transition-all font-medium truncate"
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
                  aria-label="扫描二维码验证"
                  className="flex items-center justify-center w-10 h-10 md:w-12 md:h-12 rounded-full text-[#8B7355] hover:bg-[#8B7355]/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                >
                  <QrCode className="w-5 h-5" />
                </button>
                <button 
                  disabled={isSearching || !query.trim()}
                  className="relative flex items-center justify-center h-10 md:h-[48px] px-5 md:px-7 rounded-full bg-[#8B7355] hover:bg-[#6B5346] text-white text-[13px] md:text-sm active:scale-[0.96] transition-all duration-200 shadow-sm shadow-[#8B7355]/15 hover:shadow-md hover:shadow-[#8B7355]/25 disabled:opacity-50 disabled:cursor-not-allowed font-semibold tracking-[0.1em]"
                >
                  {isSearching ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                       <span>查询</span>
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
          <div
            role="dialog"
            aria-modal="true"
            aria-label={error ? "查询结果" : "授权证书详情"}
            className="fixed inset-0 z-[110] flex items-center justify-center p-6 md:p-12"
            onKeyDown={(e) => { if (e.key === "Escape") { setResults(null); setCurrentIndex(0); setError(null); } }}>
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => { setResults(null); setCurrentIndex(0); setError(null); }}
              className="absolute inset-0 bg-slate-900/30 backdrop-blur-xl"
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
                    aria-label="关闭"
                    className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-50 text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                  >
                    <X size={16} strokeWidth={2.5} />
                  </button>
                </div>

              {error ? (
                <div className="flex flex-col items-center text-center py-8 md:py-10 gap-5 md:gap-6">
                  <Image src="/NIHPLOD-logo.svg" alt="NIHPLOD" width={0} height={0} className="h-7 md:h-10 w-auto mx-auto" unoptimized />
                  <p className="text-lg md:text-[22px] text-[#2C2A29] font-bold tracking-wide leading-snug px-2 md:px-4">{error}</p>
                  {(() => {
                    if (error === "系统查询出错，请稍后再试。") {
                      return (
                        <p className="text-[13px] md:text-[15px] text-[#8B7355]/80 leading-relaxed max-w-xl mx-auto px-0 md:px-4">
                          服务暂时不可用，请稍后重试。如问题持续，请联系客服。
                        </p>
                      );
                    }
                    return (
                      <>
                        <p className="text-[13px] md:text-[15px] text-[#8B7355]/80 leading-relaxed max-w-xl mx-auto px-0 md:px-4">
                          请核查您填写的检索信息是否准确无误。<br className="hidden md:block" />
                          为保障您的权益，如遇疑似未经官方授权的商业行为，请向我们提交反馈。
                        </p>
                        <button 
                          onClick={() => { setError(null); setShowReportModal(true); setEvidenceFiles([]); }}
                          className="bg-[#9B3D3B]/8 text-[#9B3D3B] border border-[#9B3D3B]/20 px-6 md:px-8 py-2.5 md:py-3 rounded-xl text-sm hover:bg-[#9B3D3B]/15 hover:border-[#9B3D3B]/30 transition-colors flex items-center justify-center gap-2 mx-auto tracking-[0.1em] font-medium"
                        >
                          <AlertTriangle className="w-4 h-4" /> 官方维权申诉与核查
                        </button>
                      </>
                    );
                  })()}
                </div>
              ) : result ? (
                <div className="relative w-full flex flex-col">
                  <div className="flex flex-col space-y-5 md:space-y-10 relative z-10">
                    <div className="space-y-4 md:space-y-5 px-0">
                      <div className="flex items-center gap-1.5 md:gap-2 text-[#8B7355] text-[10px] md:text-[11px] font-bold tracking-[0.15em] md:tracking-[0.2em] bg-[#8B7355]/5 px-2.5 md:px-3 py-1.5 rounded-full border border-[#8B7355]/20 w-fit shadow-sm shadow-[#8B7355]/5">
                         <CheckCircle2 className="w-3 h-3 md:w-3.5 md:h-3.5" /> 官方授权企业资质认证
                      </div>
                      
                      <div>
                         {(() => {
                           const shop = result.dealerName;
                           const comp = result.companyName;
                           const isShopValid = shop && shop !== '未知经销商';
                           const title = isShopValid ? shop : (comp || shop || '');
                           return (
                             <>
                               <h2 className="text-2xl md:text-[34px] font-black text-[#2C2A29] tracking-[0.05em] leading-snug break-words">{title}</h2>
                               {isShopValid && comp && comp !== shop && (
                                 <p className="mt-2 text-[15px] md:text-[17px] text-[#5C5348] font-semibold tracking-wide">
                                   {comp}
                                 </p>
                               )}
                             </>
                           );
                         })()}
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
                    <div className="relative flex flex-col gap-4 md:gap-8 pt-5 md:pt-10 border-t border-dashed border-[#8B7355]/20 bg-slate-50/60 -mx-6 md:-mx-14 -mb-6 md:-mb-14 px-6 md:px-14 pb-8 md:pb-14 rounded-b-[24px] md:rounded-b-[32px]">
                       <div className="space-y-2 md:space-y-4 relative z-10">
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
                    className="absolute top-1/2 left-3 md:-left-16 -translate-y-1/2 flex items-center justify-center w-10 h-10 md:w-12 md:h-12 bg-white/80 backdrop-blur-md text-[#8B7355] disabled:opacity-0 disabled:pointer-events-none hover:text-[#2C2A29] hover:bg-white rounded-full shadow-lg border border-slate-200/50 transition-colors z-[60]"
                  >
                    <ChevronLeft className="w-5 h-5 md:w-6 md:h-6 -ml-0.5" />
                  </button>
                  <button 
                    onClick={() => setCurrentIndex(Math.min(results.length - 1, currentIndex + 1))}
                    disabled={currentIndex === results.length - 1}
                    className="absolute top-1/2 right-3 md:-right-16 -translate-y-1/2 flex items-center justify-center w-10 h-10 md:w-12 md:h-12 bg-white/80 backdrop-blur-md text-[#8B7355] disabled:opacity-0 disabled:pointer-events-none hover:text-[#2C2A29] hover:bg-white rounded-full shadow-lg border border-slate-200/50 transition-colors z-[60]"
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
          <div
            role="dialog"
            aria-modal="true"
            aria-label="官方维权申诉"
            className="fixed inset-0 z-[60] flex md:items-center md:justify-center"
            onKeyDown={(e) => { if (e.key === "Escape") { setShowReportModal(false); resetReportForm(); } }}>
            <motion.div 
               initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
               onClick={() => { setShowReportModal(false); resetReportForm(); }}
               className="absolute inset-0 bg-slate-900/30 backdrop-blur-xl"
            />
            <motion.div 
               initial={{ opacity: 0, scale: 0.98, y: 10 }}
               animate={{ opacity: 1, scale: 1, y: 0 }}
               exit={{ opacity: 0, scale: 0.98, y: 10 }}
               className="relative w-full h-full md:h-auto md:max-w-xl bg-white rounded-none md:rounded-[28px] shadow-2xl p-6 md:p-10 overflow-y-auto"
            >
              <div className="absolute top-4 right-4 md:top-6 md:right-6">
                <button 
                  onClick={() => { setShowReportModal(false); resetReportForm(); }}
                  aria-label="关闭"
                  className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-50 text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                >
                  <X size={16} strokeWidth={2.5} />
                </button>
              </div>

              <div className="text-center mb-6 pt-2 md:mb-10">
                 <Image src="/NIHPLOD-logo.svg" alt="NIHPLOD" width={0} height={0} className="h-[34px] w-auto mx-auto mb-4 md:mb-7" unoptimized />
                 <h2 className="text-xl font-bold text-slate-900 tracking-[0.1em]">官方维权申诉与核查</h2>
              </div>

              <div className="space-y-6">
                 <div className="space-y-2">
                    <label className="text-[11px] font-medium text-slate-500 tracking-[0.05em] ml-1">涉嫌侵权描述 <span className="text-red-400">*</span></label>
                    <textarea 
                       value={reportDesc}
                       onChange={(e) => setReportDesc(e.target.value)}
                       placeholder="请简要描述您的维权申诉内容，我们将进行后台核查..."
                       className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-5 text-sm outline-none focus:border-red-200 focus:ring-4 focus:ring-red-500/5 transition-[border-color,box-shadow] h-24 md:h-32 resize-none placeholder:text-slate-400"
                    />
                 </div>
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
                    <div className="space-y-2">
                       <label className="text-[11px] font-medium text-slate-500 tracking-[0.05em] ml-1">涉嫌违规渠道/商铺 <span className="text-slate-300">(选填)</span></label>
                       <input 
                          type="text" 
                          value={reportChannel}
                          onChange={(e) => setReportChannel(e.target.value)}
                          placeholder="如: 天猫 XXX 旗舰店"
                          className="w-full bg-slate-50 border border-slate-100 rounded-xl p-4 text-sm outline-none focus:border-red-200 focus:ring-4 focus:ring-red-500/5 transition-[border-color,box-shadow] placeholder:text-slate-400"
                       />
                    </div>
                    <div className="space-y-2">
                       <label className="text-[11px] font-medium text-slate-500 tracking-[0.05em] ml-1">联系方式 <span className="text-red-400">*</span></label>
                       <input 
                          type="text" 
                          value={reportContact}
                          onChange={(e) => setReportContact(e.target.value)}
                          placeholder="手机号 / 邮箱 / 微信号"
                          className="w-full bg-slate-50 border border-slate-100 rounded-xl p-4 text-sm outline-none focus:border-red-200 focus:ring-4 focus:ring-red-500/5 transition-[border-color,box-shadow] placeholder:text-slate-400"
                       />
                    </div>
                 </div>
                 <div className="space-y-2">
                    <label className="text-[11px] font-medium text-slate-500 tracking-[0.05em] ml-1">证据图片 <span className="text-slate-300">(可选，最多 5 张，每张限 5MB)</span></label>
                    <label className="w-full h-[54px] bg-slate-50 border border-dashed border-slate-200 rounded-xl flex items-center justify-center text-slate-300 hover:text-slate-400 hover:border-slate-300 transition-[border-color,box-shadow] cursor-pointer relative overflow-hidden group">
                       <input 
                         type="file" 
                         accept="image/jpeg,image/png,image/gif,image/webp" 
                         multiple
                         className="hidden" 
                         onChange={(e) => {
                           if (e.target.files && e.target.files.length > 0) {
                             const files = Array.from(e.target.files);
                             const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
                             const MAX_SIZE = 5 * 1024 * 1024;
                             const MAX_COUNT = 5;
                             
                             if (evidenceFiles.length + files.length > MAX_COUNT) {
                               toast({ message: `最多只能上传 ${MAX_COUNT} 张图片`, type: 'warning' });
                               return;
                             }
                             
                             const validFiles: File[] = [];
                             for (const file of files) {
                               if (!ALLOWED_TYPES.includes(file.type)) {
                                 toast({ message: `「${file.name}」格式不支持`, type: 'error' });
                                 continue;
                               }
                               if (file.size > MAX_SIZE) {
                                 toast({ message: `「${file.name}」超过 5MB 限制`, type: 'error' });
                                 continue;
                               }
                               validFiles.push(file);
                             }
                             
                             if (validFiles.length > 0) {
                               setEvidenceFiles(prev => [...prev, ...validFiles]);
                             }
                           }
                         }}
                       />
                       {evidenceFiles.length > 0 ? (
                         <div className="flex items-center gap-2 px-4 w-full overflow-x-auto">
                            <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                            <span className="text-xs text-slate-600">已选 {evidenceFiles.length} 张</span>
                         </div>
                       ) : (
                         <Camera className="w-5 h-5 group-hover:scale-110 transition-transform" />
                       )}
                    </label>
                    {/* 多图预览列表 */}
                    {evidenceFiles.length > 0 && (
                      <div className="flex flex-wrap gap-2 mt-2">
                        {evidenceFiles.map((file, idx) => {
                          let url = evidencePreviewUrls.current.get(file.name);
                          if (!url) {
                            url = URL.createObjectURL(file);
                            evidencePreviewUrls.current.set(file.name, url);
                          }
                          return (
                            <div key={idx} className="relative group">
                              <div className="w-16 h-16 rounded-lg bg-slate-100 border border-slate-200 overflow-hidden flex items-center justify-center">
                                <Image 
                                  src={url} 
                                  alt={file.name}
                                  width={64}
                                  height={64}
                                  className="w-full h-full object-cover"
                                  unoptimized
                                />
                              </div>
                              <button
                                onClick={() => {
                                  const revokeUrl = evidencePreviewUrls.current.get(file.name);
                                  if (revokeUrl) {
                                    URL.revokeObjectURL(revokeUrl);
                                    evidencePreviewUrls.current.delete(file.name);
                                  }
                                  setEvidenceFiles(prev => prev.filter((_, i) => i !== idx));
                                }}
                                className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-white rounded-full shadow-md border border-slate-200 flex items-center justify-center text-slate-400 hover:text-red-500 transition-colors"
                                type="button"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                 </div>
                 <button 
                   onClick={handleReportSubmit}
                   disabled={isSubmittingReport || reportSuccess}
                   className="w-full bg-[#8B7355]/10 text-[#8B7355] border border-[#8B7355]/40 rounded-xl py-3.5 font-semibold tracking-[0.1em] text-[13px] hover:bg-[#8B7355]/20 hover:border-[#8B7355]/70 active:scale-[0.98] mt-6 flex items-center justify-center gap-2 transition-colors duration-300 disabled:opacity-50 disabled:cursor-not-allowed">
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
          <div
            role="dialog"
            aria-modal="true"
            aria-label="扫码验证"
            tabIndex={-1}
            className="fixed inset-0 z-[110] flex md:items-center md:justify-center"
            onKeyDown={(e) => { if (e.key === "Escape") handleCloseScanner(); }}>
            <motion.div 
               initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
               onClick={handleCloseScanner}
               className="absolute inset-0 bg-slate-900/30 backdrop-blur-xl"
            />

            {/* 浮动错误提示 */}
            <AnimatePresence>
              {scanError && (
                <motion.div
                  initial={{ opacity: 0, y: 20, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 10, scale: 0.95 }}
                  className="absolute bottom-6 md:top-12 md:bottom-auto left-1/2 -translate-x-1/2 z-[100] bg-white text-slate-800 px-5 py-3 rounded-full shadow-[0_8px_30px_rgb(0,0,0,0.08)] border border-slate-100 flex items-center gap-3 text-xs font-medium tracking-[0.05em] whitespace-nowrap"
                >
                  <div className="w-6 h-6 rounded-full bg-amber-50 flex items-center justify-center shrink-0">
                    <AlertTriangle className="w-[14px] h-[14px] text-amber-500" />
                  </div>
                  {scanError}
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="ml-1 px-3 py-1 rounded-full bg-[#8B7355]/10 text-[#8B7355] text-[11px] font-semibold hover:bg-[#8B7355]/20 transition-colors cursor-pointer"
                  >
                    从相册选择
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
            <motion.div 
               initial={{ opacity: 0, scale: 0.98, y: 10 }}
               animate={{ opacity: 1, scale: 1, y: 0 }}
               exit={{ opacity: 0, scale: 0.98, y: 10 }}
               className="relative w-full h-full md:h-auto md:max-w-md bg-[#FDFBF7] border border-[#E8E0D5]/40 rounded-none md:rounded-[28px] shadow-2xl p-4 md:p-10 overflow-y-auto flex flex-col"
            >
              {/* 手机端顶部栏：Logo 居中 + 关闭 */}
              <div className="flex md:hidden items-center justify-center relative mt-4 mb-4">
                <Image src="/NIHPLOD-logo.svg" alt="NIHPLOD" width={0} height={0} className="h-7 w-auto" unoptimized />
                <button 
                  onClick={handleCloseScanner}
                  aria-label="关闭"
                  className="absolute right-0 w-8 h-8 flex items-center justify-center rounded-full bg-slate-50 text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                >
                  <X size={16} strokeWidth={2.5} />
                </button>
              </div>

              {/* PC 端绝对定位关闭按钮 */}
              <div className="absolute top-4 right-4 md:top-6 md:right-6 hidden md:block">
                <button 
                  onClick={handleCloseScanner}
                  aria-label="关闭"
                  className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-50 text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                >
                  <X size={16} strokeWidth={2.5} />
                </button>
              </div>

              {/* 内容区：手机端在剩余空间居中 */}
              <div className="flex-1 flex flex-col justify-center md:block">

              <div className="text-center mb-6 md:mb-10">
                 <Image src="/NIHPLOD-logo.svg" alt="NIHPLOD" width={0} height={0} className="hidden md:block h-[34px] w-auto mx-auto mb-3 md:mb-7" unoptimized />
                 <h2 className="text-xl font-bold text-slate-900 tracking-[0.1em]">扫码验证</h2>
                 <p className="text-sm text-slate-500 mt-1.5">将摄像头对准授权书上的二维码</p>
              </div>

              <div className="relative mb-6 overflow-hidden rounded-2xl bg-slate-900 border border-slate-100 shadow-inner w-full md:max-w-xs mx-auto">
                {(!scannerReady || isScanning) && !scanError && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center z-10 bg-white/90 backdrop-blur-sm">
                    <RefreshCw className="w-8 h-8 animate-spin text-[#8B7355] mb-4" />
                    <p className="text-xs text-[#8B7355] font-medium tracking-[0.05em]">
                      {isScanning ? "正在核验授权信息..." : "正在启动安全摄像头..."}
                    </p>
                  </div>
                )}
                <div id="qr-scanner-container" style={{ width: '100%', aspectRatio: '1/1' }}></div>
              </div>

              <div className="flex flex-col gap-4">
                <div className="text-center">
                  <button 
                    onClick={() => fileInputRef.current?.click()}
                    className="inline-flex items-center gap-1.5 text-[11px] text-[#8B7355]/70 hover:text-[#6B5346] transition-colors group"
                  >
                    <Upload className="w-3.5 h-3.5 group-hover:-translate-y-0.5 transition-transform" />
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

              </div>

              {/* 手机端底部版权栏 */}
              <div className="flex md:hidden items-center justify-center py-4 border-t border-[#E8E0D5]/30">
                <p className="text-[10px] text-slate-400/50">
                  &copy; {new Date().getFullYear()} NIHPLOD. All rights reserved
                </p>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* 页脚 */}
      <footer className="w-full px-6 md:px-12 lg:px-20 py-6 md:py-10 flex flex-col md:flex-row justify-between items-center gap-4 md:gap-6 shrink-0 border-t border-slate-100/30">
        <div className="flex flex-col items-center md:items-start gap-2 md:gap-0.5 order-1">
          <p className="order-2 md:order-1 flex flex-col md:flex-row items-center md:items-start gap-y-2 md:gap-x-1.5 md:gap-y-0.5 text-[11px] font-normal text-slate-400/60 tracking-normal antialiased">
            {/* 手机第一行：ICP + 电子营业执照；桌面作为独立 flex 项参与横向排列 */}
            <span className="inline-flex md:contents items-center gap-1 order-1">
              <a
                href="https://beian.miit.gov.cn/"
                target="_blank"
                rel="noopener noreferrer"
                className="order-1 md:order-1 hover:text-slate-500 transition-colors"
              >
                沪ICP备2026014764号-1
              </a>
              <span className="hidden md:inline text-slate-300/40 select-none order-2 md:order-2">|</span>
              <span className="md:hidden text-slate-300/40 select-none order-2">|</span>
              <a
                href="https://wap.scjgj.sh.gov.cn/businessCheck/verifKey.do?showType=extShow&serial=YOUR_SERIAL&signData=YOUR_SIGN_DATA"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-0.5 order-3 md:order-5 hover:text-slate-500 transition-colors"
              >
                <Image src="/assets/aic_icon.png" alt="电子营业执照" width={14} height={14} className="w-3.5 h-3.5 opacity-50" unoptimized />
                电子营业执照
              </a>
            </span>

            {/* 手机第二行 / 桌面第二项 */}
            <a
              href="https://www.beian.gov.cn/portal/registerSystemInfo"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-0.5 order-3 md:order-3 hover:text-slate-500 transition-colors"
            >
              <Image src="/assets/beian.webp" alt="公安网备" width={10} height={10} className="w-2.5 h-2.5 opacity-50" unoptimized />
              沪公网安备31010702010178号
            </a>

            {/* 桌面分隔符：沪公网安备 与 电子营业执照 之间 */}
            <span className="hidden md:inline text-slate-300/40 select-none order-4">|</span>
          </p>
          <p className="order-1 md:order-2 text-[11px] font-normal text-slate-400/60 tracking-normal antialiased">
            &copy; {new Date().getFullYear()} NIHPLOD. All rights reserved
          </p>
        </div>
        <div className="hidden md:flex flex-wrap items-center justify-center md:justify-end gap-6 md:gap-x-4 md:gap-y-1 text-[11px] font-normal text-slate-400/80 order-2 w-full md:w-auto">
          {/* 官方维权申诉 */}
          <button
            onClick={() => { setShowReportModal(true); setEvidenceFiles([]); }}
            className="text-xs text-slate-500/90 md:text-red-400/90 hover:text-red-500 cursor-pointer transition-colors flex items-center gap-1.5 whitespace-nowrap px-3 py-2 md:px-0 md:py-0"
          >
            <ShieldAlert className="w-3 h-3 text-red-400/70 md:text-red-400/90" /> 官方维权申诉
          </button>

          <span className="hidden md:inline text-slate-300/60">|</span>

          {/* 隐私声明 */}
          <a
            href="https://nihplod.cn/privacy"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-slate-500/90 md:text-slate-500 hover:text-slate-600 hover:underline underline-offset-2 cursor-pointer transition-colors whitespace-nowrap inline-flex items-center gap-1 px-3 py-2 md:px-0 md:py-0"
          >
            隐私声明
            <ExternalLink className="w-2.5 h-2.5 opacity-50" />
          </a>
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
      <ResetPasswordModal
        isOpen={showResetPasswordModal}
        onClose={() => setShowResetPasswordModal(false)}
      />
    </main>
  );
}

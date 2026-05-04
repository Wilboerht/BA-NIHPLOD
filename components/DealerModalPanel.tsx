"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { FileText, Download, LogOut, Loader2, ShieldCheck, Clock, X, CheckCircle, AlertCircle, File, Lock } from "lucide-react";
import jsPDF from "jspdf";
import CertificateGenerator, { CertData } from "@/components/certificate/CertificateGenerator";

interface UserInfo {
  id: string;
  phone: string;
  username: string;
  full_name: string;
  role: string;
}

interface Certificate {
  id: string;
  cert_number: string;
  start_date: string;
  end_date: string;
  status: string;
  final_image_url?: string;
  seal_url?: string;
  auth_scope?: string;
  dealers?: {
    id: string;
    company_name: string;
    phone: string;
  };
  templates?: {
    id: string;
    stamp_url: string;
  };
}

interface DealerModalPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenResetPassword?: () => void;
}

export default function DealerModalPanel({ isOpen, onClose, onOpenResetPassword }: DealerModalPanelProps) {
  const [user, setUser] = useState<UserInfo | null>(null);
  const [certificates, setCertificates] = useState<Certificate[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isDownloading, setIsDownloading] = useState<string | null>(null);
  const [showHiddenGenerator, setShowHiddenGenerator] = useState(false);
  const [generatorDataForBackground, setGeneratorDataForBackground] = useState<CertData | undefined>(undefined);
  const [isPdfModeBackground, setIsPdfModeBackground] = useState(false);

  // 模态框打开时加载用户信息和证书
  useEffect(() => {
    if (!isOpen) {
      setUser(null);
      setCertificates([]);
      return;
    }

    const loadDealerData = async () => {
      setIsLoading(true);
      try {
        const res = await fetch('/api/auth/me');
        if (!res.ok) {
          console.error("No user session found");
          onClose();
          return;
        }

        const data = await res.json();
        const userData = data.user as UserInfo;
        if (process.env.NODE_ENV !== 'production') console.log("User from API:", userData);
        
        // 只允许DEALER角色打开
        if (userData?.role !== "DEALER") {
          console.error("User is not a DEALER:", userData?.role);
          onClose();
          return;
        }

        setUser(userData);
        await fetchCertificates(userData.id);
      } catch (error) {
        console.error("加载经销商数据失败:", error);
      } finally {
        setIsLoading(false);
      }
    };

    loadDealerData();
  }, [isOpen, onClose]);

  const fetchCertificates = useCallback(async (userId: string) => {
    try {
      if (process.env.NODE_ENV !== 'production') console.log("Fetching certificates for userId:", userId);
      
      // 调用 API 路由，让服务器端使用 service role key 查询
      const response = await fetch(`/api/dealer/certificates?userId=${userId}`);
      const result = await response.json();

      if (!response.ok) {
        console.error("API error:", result.error);
        setCertificates([]);
        return;
      }

      if (process.env.NODE_ENV !== 'production') console.log("API response:", result);
      if (process.env.NODE_ENV !== 'production') console.log("Certificates data:", JSON.stringify(result.certificates, null, 2));
      
      // 调试：打印每个证书的 final_image_url
      if (result.certificates && result.certificates.length > 0) {
        result.certificates.forEach((cert: Certificate, idx: number) => {
          if (process.env.NODE_ENV !== 'production') console.log(`Certificate ${idx}:`, {
            cert_number: cert.cert_number,
            final_image_url: cert.final_image_url ? cert.final_image_url.substring(0, 100) : "NULL",
            status: cert.status
          });
        });
      }
      
      setCertificates(result.certificates || []);
    } catch (error) {
      console.error("获取证书失败:", error);
      setCertificates([]);
    }
  }, []);

  const handleDownload = async (cert: Certificate) => {
    // ✅ 如果图片为空，在后台生成证书
    if (!cert.final_image_url) {
      if (process.env.NODE_ENV !== 'production') console.log("检测到证书未生成，后台生成中...");
      const scopeParts = cert.auth_scope?.split(' | ') || ["", ""];
      const certData = {
        cert_number: cert.cert_number,
        platformId: scopeParts[0],
        platformLabel: "识别码", 
        shopName: cert.dealers?.company_name || "",
        shopLabel: "授权主体",
        scopeText: scopeParts[1] || "品牌官方经销授权",
        duration: `${cert.start_date?.replace(/-/g, '.')} - ${cert.end_date?.replace(/-/g, '.')}`,
        authorizer: "旎柏（上海）商贸有限公司",
        sealImage: cert.templates?.stamp_url || "/default-seal.svg",
        phone: cert.dealers?.phone || ""
      };
      setIsDownloading(cert.id);
      // 设置在后台生成，会触发隐藏生成器
      setGeneratorDataForBackground(certData);
      setIsPdfModeBackground(false);
      setShowHiddenGenerator(true);
      return;
    }

    if (process.env.NODE_ENV !== 'production') console.log("Download PNG - cert.final_image_url:", cert.final_image_url.substring(0, 100));

    // 检测是否是占位符图片
    const isPlaceholder = cert.final_image_url.includes("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJ");
    if (isPlaceholder) {
      if (process.env.NODE_ENV !== 'production') console.log("检测到占位符图片，后台生成中...");
      const scopeParts = cert.auth_scope?.split(' | ') || ["", ""];
      const certData = {
        cert_number: cert.cert_number,
        platformId: scopeParts[0],
        platformLabel: "识别码", 
        shopName: cert.dealers?.company_name || "",
        shopLabel: "授权主体",
        scopeText: scopeParts[1] || "品牌官方经销授权",
        duration: `${cert.start_date?.replace(/-/g, '.')} - ${cert.end_date?.replace(/-/g, '.')}`,
        authorizer: "旎柏（上海）商贸有限公司",
        sealImage: cert.templates?.stamp_url || "/default-seal.svg",
        phone: cert.dealers?.phone || ""
      };
      setIsDownloading(cert.id);
      setGeneratorDataForBackground(certData);
      setIsPdfModeBackground(false);
      setShowHiddenGenerator(true);
      return;
    }

    setIsDownloading(cert.id);
    try {
      let blob: Blob;
      
      // 检查是否是 data URL（base64 格式）
      if (cert.final_image_url.startsWith('data:')) {
        if (process.env.NODE_ENV !== 'production') console.log("处理 data URL");
        // 处理 data URL
        const arr = cert.final_image_url.split(',');
        const mimeMatch = arr[0].match(/:(.*?);/);
        const mime = mimeMatch ? mimeMatch[1] : 'image/png';
        const bstr = atob(arr[1]);
        const n = bstr.length;
        const u8arr = new Uint8Array(n);
        for (let i = 0; i < n; i++) {
          u8arr[i] = bstr.charCodeAt(i);
        }
        blob = new Blob([u8arr], { type: mime });
        if (process.env.NODE_ENV !== 'production') console.log("Base64 解析成功, blob size:", blob.size);
      } else {
        // 处理远程 URL
        if (process.env.NODE_ENV !== 'production') console.log("处理远程 URL:", cert.final_image_url);
        const response = await fetch(cert.final_image_url);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: 无法获取图片`);
        }
        blob = await response.blob();
        if (process.env.NODE_ENV !== 'production') console.log("远程 URL 获取成功, blob size:", blob.size);
      }

      if (blob.size === 0) {
        alert("下载的文件为空！请检查证书是否已正确生成。");
        return;
      }

      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `授权书_${cert.dealers?.company_name || cert.cert_number}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      if (process.env.NODE_ENV !== 'production') console.log("PNG 下载完成");
    } catch (error) {
      console.error("下载失败:", error);
      alert("下载失败：" + (error as Error).message);
    } finally {
      setIsDownloading(null);
    }
  };

  const handleDownloadPDF = async (cert: Certificate) => {
    // ✅ 如果图片为空，在后台生成证书
    if (!cert.final_image_url) {
      if (process.env.NODE_ENV !== 'production') console.log("检测到证书未生成，后台生成中...");
      const scopeParts = cert.auth_scope?.split(' | ') || ["", ""];
      const certData = {
        cert_number: cert.cert_number,
        platformId: scopeParts[0],
        platformLabel: "识别码", 
        shopName: cert.dealers?.company_name || "",
        shopLabel: "授权主体",
        scopeText: scopeParts[1] || "品牌官方经销授权",
        duration: `${cert.start_date?.replace(/-/g, '.')} - ${cert.end_date?.replace(/-/g, '.')}`,
        authorizer: "旎柏（上海）商贸有限公司",
        sealImage: cert.templates?.stamp_url || "/default-seal.svg",
        phone: cert.dealers?.phone || ""
      };
      setIsDownloading(cert.id);
      setGeneratorDataForBackground(certData);
      setIsPdfModeBackground(true);
      setShowHiddenGenerator(true);
      return;
    }

    // 检测是否是占位符图片
    const isPlaceholder = cert.final_image_url.includes("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJ");
    if (isPlaceholder) {
      if (process.env.NODE_ENV !== 'production') console.log("检测到占位符图片，后台生成中...");
      const scopeParts = cert.auth_scope?.split(' | ') || ["", ""];
      const certData = {
        cert_number: cert.cert_number,
        platformId: scopeParts[0],
        platformLabel: "识别码", 
        shopName: cert.dealers?.company_name || "",
        shopLabel: "授权主体",
        scopeText: scopeParts[1] || "品牌官方经销授权",
        duration: `${cert.start_date?.replace(/-/g, '.')} - ${cert.end_date?.replace(/-/g, '.')}`,
        authorizer: "旎柏（上海）商贸有限公司",
        sealImage: cert.templates?.stamp_url || "/default-seal.svg",
        phone: cert.dealers?.phone || ""
      };
      setIsDownloading(cert.id);
      setGeneratorDataForBackground(certData);
      setIsPdfModeBackground(true);
      setShowHiddenGenerator(true);
      return;
    }

    setIsDownloading(cert.id);
    try {
      let imgData: string;

      // 如果是 data URL，直接使用
      if (cert.final_image_url.startsWith('data:')) {
        if (process.env.NODE_ENV !== 'production') console.log("使用 data URL");
        imgData = cert.final_image_url;
      } else {
        // 如果是远程 URL，转换为 data URL
        if (process.env.NODE_ENV !== 'production') console.log("转换远程 URL 为 data URL:", cert.final_image_url);
        const response = await fetch(cert.final_image_url);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: 无法获取图片`);
        }
        const blob = await response.blob();
        if (process.env.NODE_ENV !== 'production') console.log("远程 blob 获取成功, size:", blob.size);
        
        imgData = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
            const result = reader.result as string;
            if (process.env.NODE_ENV !== 'production') console.log("FileReader 成功，data URL 长度:", result.length);
            resolve(result);
          };
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
      }

      if (!imgData || imgData.length === 0) {
        alert("图片数据为空！");
        return;
      }

      // 创建 PDF
      const pdfWidth = 210; // A4 宽度 mm
      const pdfHeight = 297; // A4 高度 mm
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
      });

      // 计算图片尺寸，保持长宽比
      const imgWidth = pdfWidth - 20; // 留边距
      const imgHeight = imgWidth * 1.4; // 假设证书是 1:1.4 的比例
      const x = 10;
      const y = (pdfHeight - imgHeight) / 2;

      if (process.env.NODE_ENV !== 'production') console.log("添加图片到 PDF, width:", imgWidth, "height:", imgHeight);
      pdf.addImage(imgData, 'PNG', x, y, imgWidth, imgHeight);

      // 保存 PDF
      const fileName = `授权书_${cert.dealers?.company_name || cert.cert_number}.pdf`;
      pdf.save(fileName);
      if (process.env.NODE_ENV !== 'production') console.log("PDF 下载完成:", fileName);
    } catch (error) {
      console.error("PDF 下载失败:", error);
      alert("PDF 下载失败：" + (error as Error).message);
    } finally {
      setIsDownloading(null);
    }
  };

  // 隐藏容器中自动下载证书
  useEffect(() => {
    if (showHiddenGenerator && generatorDataForBackground) {
      const downloadTimer = setTimeout(() => {
        const hiddenContainer = document.getElementById('hidden-certificate-canvas-container');
        const canvas = hiddenContainer?.querySelector('canvas') as HTMLCanvasElement;
        
        if (canvas && canvas.width > 0 && canvas.height > 0) {
          try {
            const dataUrl = canvas.toDataURL('image/png');
            if (process.env.NODE_ENV !== 'production') console.log("Canvas已就绪，长度:", dataUrl.length);

            if (isPdfModeBackground) {
              // 转换为PDF
              const pdf = new jsPDF({
                orientation: 'portrait',
                unit: 'mm',
                format: 'a4'
              });

              const pdfWidth = 210;
              const pdfHeight = 297;
              const margin = 10;
              const contentWidth = pdfWidth - 2 * margin;
              const contentHeight = pdfHeight - 2 * margin;

              const imgRatio = 800 / 1131;
              let width, height;
              if (imgRatio > contentWidth / contentHeight) {
                width = contentWidth;
                height = width / imgRatio;
              } else {
                height = contentHeight;
                width = height * imgRatio;
              }

              const x = margin + (contentWidth - width) / 2;
              const y = margin + (contentHeight - height) / 2;

              pdf.addImage(dataUrl, "PNG", x, y, width, height);
              pdf.save(`授权书_${generatorDataForBackground.shopName}.pdf`);
              if (process.env.NODE_ENV !== 'production') console.log("PDF自动下载完成");
            } else {
              // 下载为PNG
              const link = document.createElement('a');
              link.href = dataUrl;
              link.download = `授权书_${generatorDataForBackground.shopName}.png`;
              document.body.appendChild(link);
              link.click();
              document.body.removeChild(link);
              if (process.env.NODE_ENV !== 'production') console.log("PNG自动下载完成");
            }

            // 下载完成后关闭生成器并清理状态
            setShowHiddenGenerator(false);
            setGeneratorDataForBackground(undefined);
            setIsPdfModeBackground(false);
            setIsDownloading(null);
            // 刷新证书列表
            if (user?.id) {
              fetchCertificates(user.id);
            }
          } catch (error) {
            console.error("自动下载失败:", error);
            alert("下载失败：" + (error as Error).message);
            setShowHiddenGenerator(false);
            setGeneratorDataForBackground(undefined);
            setIsPdfModeBackground(false);
            setIsDownloading(null);
          }
        }
      }, 800); // 延迟800ms确保canvas渲染完成

      return () => clearTimeout(downloadTimer);
    }
  }, [showHiddenGenerator, generatorDataForBackground, isPdfModeBackground]);

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch (e) {
      console.error('Logout API error:', e);
    }
    onClose();
    window.location.href = "/";
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div key="dealer-modal" className="fixed inset-0 z-[80] flex items-center justify-center p-4 md:p-6">
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-slate-900/20 backdrop-blur-md"
          />
          <motion.div 
            initial={{ opacity: 0, scale: 0.98, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, y: 20 }}
            className="relative w-full max-w-4xl bg-white rounded-[24px] shadow-2xl flex flex-col max-h-[90vh] overflow-hidden border border-slate-100"
          >
            {/* Header */}
            <div className="px-8 py-6 flex justify-between items-start bg-white shrink-0 border-b border-slate-100/50">
              <div className="flex-1">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center">
                    <FileText size={20} className="text-blue-500" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-slate-900">
                      我的授权书
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">账号：{user?.phone}</p>
                  </div>
                </div>
              </div>
              <button 
                onClick={onClose}
                className="w-10 h-10 flex items-center justify-center rounded-full bg-slate-50 text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-all active:scale-90 shrink-0"
              >
                <X size={18} />
              </button>
            </div>

            {/* Loading State */}
            {isLoading ? (
              <div className="flex-1 flex items-center justify-center min-h-96 px-8 py-12">
                <div className="text-center space-y-6">
                  <Loader2 className="w-12 h-12 animate-spin mx-auto text-blue-500" />
                  <p className="text-slate-600 text-base font-medium">加载证书中...</p>
                </div>
              </div>
            ) : (
              <>
                {/* Scrollable Content */}
                <div className="flex-1 overflow-y-auto custom-scrollbar relative">
                  {certificates.length === 0 ? (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
                      <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center">
                        <FileText className="w-8 h-8 text-slate-400" />
                      </div>
                      <p className="text-slate-600 font-semibold">暂无证书</p>
                      <p className="text-slate-400 text-sm">您将在获得授权后看到证书信息</p>
                    </div>
                  ) : (
                    <table className="w-full text-left text-sm whitespace-nowrap table-auto border-separate border-spacing-0">
                      <thead className="text-slate-500 font-semibold uppercase tracking-wider text-xs bg-slate-50/80 sticky top-0 z-10">
                        <tr>
                          <th className="px-6 py-4 border-b border-slate-100">证书编号</th>
                          <th className="px-6 py-4 border-b border-slate-100">主体名称</th>
                          <th className="px-6 py-4 border-b border-slate-100">有效期</th>
                          <th className="px-6 py-4 border-b border-slate-100 text-center">状态</th>
                          <th className="px-6 py-4 border-b border-slate-100 text-right">操作</th>
                        </tr>
                      </thead>
                      <tbody className="text-slate-700 font-medium">
                        {certificates.filter(c => c.status === 'ISSUED').map((cert) => {
                          const now = new Date();
                          const endDate = new Date(cert.end_date + "T23:59:59");
                          const isExpired = now > endDate;

                          return (
                            <tr key={cert.id} className="hover:bg-slate-50/50 transition-colors group border-b border-slate-50">
                              <td className="px-6 py-4 font-mono text-xs text-slate-600 uppercase tracking-tighter">{cert.cert_number}</td>
                              <td className="px-6 py-4 text-xs text-slate-900 font-semibold">{cert.dealers?.company_name || "-"}</td>
                              <td className="px-6 py-4 text-xs text-slate-600">
                                {cert.start_date.replace(/-/g, ".")} — {cert.end_date.replace(/-/g, ".")}
                              </td>
                              <td className="px-6 py-4 text-center">
                                {isExpired ? (
                                  <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-100 text-slate-600 text-[10px] font-bold rounded-full">
                                    已失效
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-100 text-emerald-700 text-[10px] font-bold rounded-full">
                                    <ShieldCheck className="w-3 h-3" />
                                    生效中
                                  </span>
                                )}
                              </td>
                              <td className="px-6 py-4 text-right">
                                <div className="flex items-center justify-end gap-2 opacity-60 group-hover:opacity-100 transition-opacity">
                                  <button
                                    onClick={() => handleDownload(cert)}
                                    disabled={isDownloading === cert.id}
                                    title="下载证书为 PNG 格式"
                                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-slate-600 hover:text-blue-500 font-bold text-xs transition-all active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 whitespace-nowrap"
                                  >
                                    {isDownloading === cert.id ? (
                                      <Loader2 className="w-3 h-3 animate-spin" />
                                    ) : (
                                      <Download className="w-3 h-3" />
                                    )}
                                    <span>PNG</span>
                                  </button>
                                  <button
                                    onClick={() => handleDownloadPDF(cert)}
                                    disabled={isDownloading === cert.id}
                                    title="下载证书为 PDF 格式"
                                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-slate-600 hover:text-indigo-500 font-bold text-xs transition-all active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 whitespace-nowrap"
                                  >
                                    {isDownloading === cert.id ? (
                                      <Loader2 className="w-3 h-3 animate-spin" />
                                    ) : (
                                      <File className="w-3 h-3" />
                                    )}
                                    <span>PDF</span>
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>

                {/* Footer */}
                <div className="px-8 py-5 bg-gradient-to-t from-white via-white to-transparent border-t border-slate-100/50 shrink-0 space-y-3">
                  <button
                    onClick={onOpenResetPassword}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-50 hover:bg-blue-100 active:bg-blue-200 text-blue-700 font-semibold text-sm rounded-lg transition-all duration-200"
                  >
                    <Lock className="w-4 h-4" />
                    修改密码
                  </button>
                  <button
                    onClick={handleLogout}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 active:bg-slate-300 text-slate-700 font-semibold text-sm rounded-lg transition-all duration-200"
                  >
                    <LogOut className="w-4 h-4" />
                    退出登录
                  </button>
                </div>
              </>
            )}
          </motion.div>
        </div>
      )}
      {/* ✅ 隐藏的证书生成器容器 - 用于经销商下载时静默生成 */}
      {showHiddenGenerator && generatorDataForBackground && (
        <div id="hidden-certificate-canvas-container" style={{ display: 'none' }}>
          <CertificateGenerator 
            initialData={generatorDataForBackground} 
            mode="view"
            isVoided={false}
            onSuccess={() => {
              // onSuccess 由 useEffect 中的 canvas 自动下载逻辑处理
              if (process.env.NODE_ENV !== 'production') console.log("隐藏生成器成功生成证书");
            }}
          />
        </div>
      )}
    </AnimatePresence>
  );
}

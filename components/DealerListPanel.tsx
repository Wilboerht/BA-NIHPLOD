"use client";

import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { FileText, Download, LogOut, Loader2, ShieldCheck, Clock, CheckCircle, AlertCircle, File } from "lucide-react";
import jsPDF from "jspdf";

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
}

interface DealerListPanelProps {
  isVisible?: boolean;
  onLogout?: () => void;
}

export default function DealerListPanel({ isVisible = true, onLogout }: DealerListPanelProps) {
  const [user, setUser] = useState<UserInfo | null>(null);
  const [certificates, setCertificates] = useState<Certificate[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isDownloading, setIsDownloading] = useState<string | null>(null);

  // 初始化加载用户信息和证书
  useEffect(() => {
    const loadDealerData = async () => {
      setIsLoading(true);
      try {
        const userStr = sessionStorage.getItem("user");
        if (!userStr) {
          console.error("No user session found");
          return;
        }

        const userData = JSON.parse(userStr) as UserInfo;
        if (process.env.NODE_ENV !== 'production') console.log("User session:", userData);
        
        // 只允许DEALER角色
        if (userData.role !== "DEALER") {
          console.error("User is not a DEALER:", userData.role);
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

    if (isVisible) {
      loadDealerData();
    }
  }, [isVisible]);

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
      setCertificates(result.certificates || []);
    } catch (error) {
      console.error("获取证书失败:", error);
      setCertificates([]);
    }
  }, []);

  const handleDownload = async (cert: Certificate) => {
    if (!cert.final_image_url) return;

    setIsDownloading(cert.id);
    try {
      let blob: Blob;
      
      // 检查是否是 data URL（base64 格式）
      if (cert.final_image_url.startsWith('data:')) {
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
      } else {
        // 处理远程 URL
        const response = await fetch(cert.final_image_url);
        blob = await response.blob();
      }

      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${cert.cert_number}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("下载失败:", error);
      alert("下载失败，请重试");
    } finally {
      setIsDownloading(null);
    }
  };

  const handleDownloadPDF = async (cert: Certificate) => {
    if (!cert.final_image_url) return;

    setIsDownloading(cert.id);
    try {
      let imgData: string;

      // 如果是 data URL，直接使用
      if (cert.final_image_url.startsWith('data:')) {
        imgData = cert.final_image_url;
      } else {
        // 如果是远程 URL，转换为 data URL
        const response = await fetch(cert.final_image_url);
        const blob = await response.blob();
        const reader = new FileReader();
        imgData = await new Promise((resolve, reject) => {
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
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

      pdf.addImage(imgData, 'PNG', x, y, imgWidth, imgHeight);

      // 保存 PDF
      const fileName = `授权书_${cert.cert_number}.pdf`;
      pdf.save(fileName);
    } catch (error) {
      console.error("PDF 下载失败:", error);
      alert("PDF 下载失败，请重试");
    } finally {
      setIsDownloading(null);
    }
  };

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch (e) {
      console.error('Logout API error:', e);
    }
    sessionStorage.removeItem("user");
    if (onLogout) {
      onLogout();
    } else {
      window.location.href = "/";
    }
  };

  if (!isVisible) return null;

  return (
    <div className="w-full h-full bg-white flex flex-col">
      {/* Header */}
      <div className="p-6 flex justify-between items-start bg-white shrink-0 border-b border-slate-100/50">
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center">
              <FileText size={20} className="text-blue-500" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900">我的证书</h3>
              <p className="text-xs text-slate-500 mt-0.5">账号：{user?.phone}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Loading State */}
      {isLoading ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-3">
            <Loader2 className="w-8 h-8 animate-spin mx-auto text-blue-500" />
            <p className="text-slate-600 text-sm font-medium">加载证书中...</p>
          </div>
        </div>
      ) : (
        <>
          {/* Scrollable Content */}
          <div className="flex-1 overflow-y-auto px-6 py-4 custom-scrollbar">
            {certificates.length === 0 ? (
              <div className="py-12 text-center">
                <div className="w-14 h-14 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-4">
                  <FileText className="w-7 h-7 text-slate-400" />
                </div>
                <p className="text-slate-600 font-semibold text-sm">暂无证书</p>
                <p className="text-slate-400 text-xs mt-2">您将在获得授权后看到证书信息</p>
              </div>
            ) : (
              <div className="space-y-3">
                {/* Statistics */}
                <div className="grid grid-cols-2 gap-2 mb-4">
                  {(() => {
                    const now = new Date();
                    const active = certificates.filter(c => {
                      const endDate = new Date(c.end_date + "T23:59:59");
                      return now <= endDate && c.status === 'ISSUED';
                    }).length;
                    const expired = certificates.filter(c => {
                      const endDate = new Date(c.end_date + "T23:59:59");
                      return now > endDate || c.status !== 'ISSUED';
                    }).length;

                    return (
                      <>
                        <motion.div
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="p-3 bg-emerald-50 rounded-lg border border-emerald-100"
                        >
                          <div className="flex items-center gap-2 mb-1">
                            <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                            <p className="text-[10px] text-emerald-600 font-semibold">生效中</p>
                          </div>
                          <p className="text-xl font-bold text-emerald-700">{active}</p>
                        </motion.div>
                        <motion.div
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: 0.1 }}
                          className="p-3 bg-slate-50 rounded-lg border border-slate-200"
                        >
                          <div className="flex items-center gap-2 mb-1">
                            <AlertCircle className="w-3.5 h-3.5 text-slate-500" />
                            <p className="text-[10px] text-slate-600 font-semibold">已失效</p>
                          </div>
                          <p className="text-xl font-bold text-slate-700">{expired}</p>
                        </motion.div>
                      </>
                    );
                  })()}
                </div>

                {/* Certificate List */}
                {certificates.filter(c => c.status === 'ISSUED').map((cert, idx) => {
                  const now = new Date();
                  const endDate = new Date(cert.end_date + "T23:59:59");
                  const isExpired = now > endDate;
                  const daysLeft = Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

                  return (
                    <motion.div
                      key={cert.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: idx * 0.05 }}
                      className={`p-3 rounded-lg border transition-all ${
                        isExpired
                          ? "bg-slate-50 border-slate-200 hover:border-slate-300"
                          : "bg-gradient-to-br from-blue-50 to-blue-50/50 border-blue-100 hover:border-blue-200 hover:shadow-md"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <div className="flex-1 min-w-0">
                          {/* Certificate Number */}
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-mono font-bold text-slate-900 text-xs truncate">{cert.cert_number}</p>
                            {isExpired ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-slate-100 text-slate-600 text-[9px] font-bold rounded-full whitespace-nowrap">
                                已失效
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-100 text-emerald-700 text-[9px] font-bold rounded-full whitespace-nowrap">
                                <ShieldCheck className="w-2.5 h-2.5" />
                                生效中
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Date Range */}
                      <div className="flex items-center gap-1 text-xs text-slate-600 mb-2">
                        <Clock className="w-3 h-3 shrink-0 text-slate-400" />
                        <span className="text-[11px]">{cert.start_date.replace(/-/g, ".")} — {cert.end_date.replace(/-/g, ".")}</span>
                      </div>

                      {/* Days Remaining */}
                      {!isExpired && daysLeft >= 0 && (
                        <div className="text-xs text-slate-500 mb-2">
                          <span className="text-emerald-600 font-semibold">{daysLeft}</span> 天后失效
                        </div>
                      )}

                      {/* Download Buttons */}
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleDownload(cert)}
                          disabled={isDownloading === cert.id || !cert.final_image_url}
                          title={!cert.final_image_url ? "证书图片未生成" : "下载 PNG"}
                          className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-blue-500 hover:bg-blue-600 disabled:bg-slate-300 disabled:hover:bg-slate-300 text-white font-semibold text-xs rounded-md transition-all active:scale-95 disabled:cursor-not-allowed"
                        >
                          {isDownloading === cert.id ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Download className="w-3.5 h-3.5" />
                          )}
                          <span>下载 PNG</span>
                        </button>
                        <button
                          onClick={() => handleDownloadPDF(cert)}
                          disabled={isDownloading === cert.id || !cert.final_image_url}
                          title={!cert.final_image_url ? "证书文件未生成" : "下载 PDF"}
                          className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-indigo-500 hover:bg-indigo-600 disabled:bg-slate-300 disabled:hover:bg-slate-300 text-white font-semibold text-xs rounded-md transition-all active:scale-95 disabled:cursor-not-allowed"
                        >
                          {isDownloading === cert.id ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <File className="w-3.5 h-3.5" />
                          )}
                          <span>下载 PDF</span>
                        </button>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="p-4 bg-gradient-to-t from-white via-white to-transparent border-t border-slate-100/50 shrink-0">
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
    </div>
  );
}

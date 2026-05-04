"use client";

import React, { useRef, useState, useEffect } from "react";
import { Download, RefreshCw, FileText, CheckCircle2, XCircle, Type, Move, Printer, ChevronDown, X, ZoomIn, ZoomOut, File } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import jsPDF from 'jspdf';
import QRCode from "qrcode";

export interface CertData {
  id?: string;
  platformId: string;
  platformLabel: string;
  shopName: string;
  shopLabel: string;
  scopeText: string;
  duration: string;
  authorizer: string;
  sealImage: string; // URL or DataURL
  phone: string;
  cert_number?: string; // 证书编号
}

interface CertificateGeneratorProps {
  initialData?: CertData;
  mode?: 'create' | 'view' | 'edit';
  isVoided?: boolean;
  onSuccess?: () => void;
}

export default function CertificateGenerator({ initialData, mode = 'create', isVoided: initialVoided = false, onSuccess }: CertificateGeneratorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scopeRef = useRef<HTMLTextAreaElement>(null);
  const [data, setData] = useState<CertData>({
    platformId: "",
    platformLabel: "",
    shopName: "",
    shopLabel: "",
    scopeText: "拥有我公司代理的品牌 **NIHPLOD(旎柏)** 全系列产品\n在阿里巴巴集团旗下淘宝商城上的 **合格经销资格**，\n负责该品牌产品在网站内一切相关的商务推广及售后服务。",
    duration: `${new Date().getFullYear()}.${String(new Date().getMonth() + 1).padStart(2, '0')}.${String(new Date().getDate()).padStart(2, '0')} - ${new Date().getFullYear() + 1}.${String(new Date().getMonth() + 1).padStart(2, '0')}.${String(new Date().getDate()).padStart(2, '0')}`,
    authorizer: "旎柏（上海）商贸有限公司",
    sealImage: "",
    phone: "",
  });

  const [isGenerating, setIsGenerating] = useState(false);
  const [isFontLoaded, setIsFontLoaded] = useState(false);
  const [showFullPreview, setShowFullPreview] = useState(false);
  const [previewImageUrl, setPreviewImageUrl] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isIssued, setIsIssued] = useState(false);
  const [isVoided, setIsVoided] = useState(initialVoided);
  const [isDownloading, setIsDownloading] = useState(false);
  const [zoomScale, setZoomScale] = useState(1);

  const renderRequestId = useRef(0);
  const tempCertNumberRef = useRef(`BAVP-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`);

  const [userRole, setUserRole] = useState<string | null>(null);

  useEffect(() => {
    const fetchUserRole = async () => {
      try {
        const userStr = sessionStorage.getItem('user');
        if (userStr) {
          const user = JSON.parse(userStr);
          setUserRole(user.role || 'AUDITOR');
        }
      } catch (err) {
        console.warn("Failed to get user role:", err);
        setUserRole('AUDITOR');
      }
    };
    fetchUserRole();
  }, []);

  useEffect(() => {
    document.fonts.ready.then(() => {
      setIsFontLoaded(true);
    });
  }, []);

  useEffect(() => {
    if (initialData) {
      setData(initialData);
      if (mode === 'view') {
        setIsIssued(true);
        setIsVoided(initialVoided);
      }
    }
  }, [initialData, mode, initialVoided]);

  const renderCertificate = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const currentId = ++renderRequestId.current;
    setIsGenerating(true);

    const scale = 2;
    const width = 800 * scale;
    const height = 1131 * scale;

    const loadImage = (src: string | null | undefined): Promise<HTMLImageElement | null> => {
      if (!src || src.trim() === "" || src === "undefined") return Promise.resolve(null);
      return new Promise((resolve) => {
        const img = new Image();
        img.src = src;
        img.onload = () => resolve(img);
        img.onerror = () => resolve(null);
      });
    };

    const [bgImage, sealImg] = await Promise.all([
      loadImage("/cert-template.svg"),
      data.sealImage ? loadImage(data.sealImage) : loadImage("/default-seal.svg")
    ]);

    const offCanvas = document.createElement("canvas");
    offCanvas.width = width;
    offCanvas.height = height;
    const offCtx = offCanvas.getContext("2d");
    if (!offCtx) return;

    if (bgImage) {
      offCtx.drawImage(bgImage, 0, 0, width, height);
    } else {
      offCtx.fillStyle = "#ffffff";
      offCtx.fillRect(0, 0, width, height);
    }

    const textPrimary = "#334155";
    offCtx.textAlign = "center";
    offCtx.font = `bold ${21 * scale}px "Noto Serif SC", serif`;
    offCtx.fillStyle = "#1e293b";

    if (data.platformId && data.shopName) {
      offCtx.fillText(data.platformId, width / 2, 530 * scale);
      offCtx.fillText(data.shopName, width / 2, 578 * scale);
    } else if (data.platformId) {
      offCtx.fillText(data.platformId, width / 2, 554 * scale);
    } else if (data.shopName) {
      offCtx.fillText(data.shopName, width / 2, 554 * scale);
    }

    offCtx.font = `400 ${15 * scale}px "Noto Serif SC", serif`;
    offCtx.fillStyle = textPrimary;
    const scopeLines = (data.scopeText || "").split('\n');
    let startY = 630 * scale;

    const parseMarkdownBold = (line: string) => {
      const parts = [];
      const regex = /\*\*(.*?)\*\*/g;
      let lastIndex = 0;
      let match;
      while ((match = regex.exec(line)) !== null) {
        if (match.index > lastIndex) {
          parts.push({ text: line.substring(lastIndex, match.index), bold: false });
        }
        parts.push({ text: match[1], bold: true });
        lastIndex = regex.lastIndex;
      }
      if (lastIndex < line.length) {
        parts.push({ text: line.substring(lastIndex), bold: false });
      }
      return parts.length > 0 ? parts : [{ text: line, bold: false }];
    };

    scopeLines.forEach((line) => {
      const parts = parseMarkdownBold(line.trim());
      const leftMargin = 210 * scale;
      if (parts.some(p => p.bold)) {
        offCtx.textAlign = "left";
        let currentX = leftMargin;
        parts.forEach(part => {
          offCtx.font = part.bold ? `bold ${15 * scale}px "Noto Serif SC", serif` : `400 ${15 * scale}px "Noto Serif SC", serif`;
          offCtx.fillText(part.text, currentX, startY);
          currentX += offCtx.measureText(part.text).width;
        });
      } else {
        offCtx.textAlign = "left";
        offCtx.font = `400 ${15 * scale}px "Noto Serif SC", serif`;
        offCtx.fillText(line.trim(), leftMargin, startY);
      }
      startY += 30 * scale;
    });

    const formatDate = (dateStr: string) => {
      if (!dateStr) return "";
      const parts = dateStr.split('.');
      return parts.length === 3 ? `${parts[0]}年${parts[1]}月${parts[2]}日` : dateStr;
    };
    const dateRange = data.duration.split(' - ');
    offCtx.textAlign = "left";
    offCtx.font = `400 ${15 * scale}px "Noto Serif SC", serif`;
    offCtx.fillText(`授权有效期：${formatDate(dateRange[0])}至${formatDate(dateRange[1])}`, 210 * scale, startY + 25 * scale);

    offCtx.textAlign = "left";
    offCtx.font = `500 ${14 * scale}px "Noto Serif SC", serif`;
    offCtx.fillText(data.authorizer || "", width - 345 * scale, 848 * scale);

    const certNumber = (initialData?.cert_number as string) || tempCertNumberRef.current;
    if (certNumber) {
      offCtx.textAlign = "right";
      offCtx.font = `400 ${12 * scale}px "Noto Serif SC", serif`;
      offCtx.fillStyle = "#666666";
      offCtx.fillText(`证书号：${certNumber}`, width - 40 * scale, height - 30 * scale);
    }

    if (sealImg) {
      const maxSealSize = 160 * scale;
      const aspect = sealImg.width / sealImg.height;
      const drawWidth = aspect > 1 ? maxSealSize : maxSealSize * aspect;
      const drawHeight = aspect > 1 ? maxSealSize / aspect : maxSealSize;
      offCtx.save();
      offCtx.translate(width - 260 * scale, 875 * scale);
      offCtx.rotate(-0.06);
      offCtx.globalAlpha = 0.88;
      offCtx.drawImage(sealImg, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);
      offCtx.restore();
    }

    try {
      const verifyUrl = `/verify?cert=${encodeURIComponent(certNumber)}`;
      const qrDataUrl = await QRCode.toDataURL(verifyUrl, {
        width: 80,
        margin: 1,
        color: { dark: '#000000', light: '#ffffff' },
        errorCorrectionLevel: 'M'
      });
      const qrImg = await loadImage(qrDataUrl);
      if (qrImg) {
        const qrSize = 100 * scale;
        const qrX = 210 * scale;
        const qrY = height - 310 * scale;
        offCtx.drawImage(qrImg, qrX, qrY, qrSize, qrSize);
        offCtx.font = `500 ${11 * scale}px "Noto Serif SC", serif`;
        offCtx.fillStyle = "#666666";
        offCtx.textAlign = "center";
        offCtx.fillText("扫码验证", qrX + qrSize / 2, qrY + qrSize + 16 * scale);
      }
    } catch (err) {
      console.warn("QR code generation failed:", err);
    }

    if (!isIssued || isVoided) {
      offCtx.save();
      if (isVoided) {
        offCtx.translate(width / 2, height / 2);
        offCtx.textAlign = "center";
        offCtx.textBaseline = "middle";
        offCtx.font = `bold ${80 * scale}px "Noto Serif SC", serif`;
        offCtx.fillStyle = "rgba(220, 38, 38, 0.25)";
        offCtx.fillText("已 作 废", 0, 0);
        offCtx.strokeStyle = "rgba(220, 38, 38, 0.35)";
        offCtx.lineWidth = 4 * scale;
        offCtx.strokeRect(-240 * scale, -70 * scale, 480 * scale, 140 * scale);
        offCtx.strokeRect(-230 * scale, -60 * scale, 460 * scale, 120 * scale);
      } else {
        offCtx.rotate(-Math.PI / 4);
        offCtx.textAlign = "center";
        offCtx.font = `bold ${18 * scale}px "Noto Serif SC", serif`;
        offCtx.fillStyle = "rgba(100, 116, 139, 0.15)";
        const stepX = 220 * scale;
        const stepY = 160 * scale;
        for (let x = -width; x < width * 2; x += stepX) {
          for (let y = -height; y < height * 2; y += stepY) {
            offCtx.fillText("非生效授权凭证", x, y);
          }
        }
      }
      offCtx.restore();
    }

    if (currentId === renderRequestId.current) {
      canvas.width = width;
      canvas.height = height;
      ctx.clearRect(0, 0, width, height);
      ctx.drawImage(offCanvas, 0, 0);
      setIsGenerating(false);
    }
  };

  useEffect(() => {
    const h = setTimeout(() => renderCertificate(), 300);
    return () => clearTimeout(h);
  }, [data, isFontLoaded]);

  const handleDownload = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const link = document.createElement("a");
    link.download = `授权书_${data.shopName}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  };

  const handleDownloadPDF = async () => {
    try {
      setIsDownloading(true);
      const canvas = canvasRef.current;
      if (!canvas) return;
      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pdfWidth = 210;
      const pdfHeight = 297;
      const maxWidth = pdfWidth - 10;
      const maxHeight = pdfHeight - 10;
      let imgWidth = maxWidth;
      let imgHeight = (maxWidth * canvas.height) / canvas.width;
      if (imgHeight > maxHeight) {
        imgHeight = maxHeight;
        imgWidth = (maxHeight * canvas.width) / canvas.height;
      }
      pdf.addImage(imgData, 'PNG', (pdfWidth - imgWidth) / 2, (pdfHeight - imgHeight) / 2, imgWidth, imgHeight);
      pdf.save(`授权书_${data.shopName}.pdf`);
    } catch (err: unknown) {
      alert("PDF 下载失败：" + (err instanceof Error ? err.message : "未知错误"));
    } finally {
      setIsDownloading(false);
    }
  };

  const handleImagePreview = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setPreviewImageUrl(canvas.toDataURL("image/png"));
    setShowFullPreview(true);
  };

  const handleIssueSubmit = async () => {
    if (!data.shopName) {
      alert("请填写必填字段：授权主体名称");
      return;
    }
    setIsSubmitting(true);
    try {
      const canvas = canvasRef.current;
      if (!canvas) throw new Error("证书图像生成失败");
      const certImageDataUrl = canvas.toDataURL("image/png");
      const userStr = sessionStorage.getItem('user');
      if (!userStr) throw new Error("未找到登录信息");
      const user = JSON.parse(userStr);
      const isManager = ['SUPER_ADMIN', 'PROJECT_MANAGER', 'MANAGER'].includes(user.role);

      const response = await fetch("/api/certificates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: mode === 'edit' ? "update_certificate" : (isManager ? "approve_issue" : "create_pending"),
          certId: initialData?.id,
          certData: { ...data, cert_number: initialData?.cert_number || tempCertNumberRef.current, certImageDataUrl },
          managerId: user.id
        })
      });

      if (!response.ok) throw new Error("操作失败");
      alert(mode === 'edit' ? "✅ 授权信息已更新" : "✅ 证书已处理");
      setIsIssued(true);
      if (onSuccess) setTimeout(onSuccess, 800);
    } catch (err: unknown) {
      alert("操作失败：" + (err instanceof Error ? err.message : "未知错误"));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="grid lg:grid-cols-[400px_1fr] gap-12 items-start h-full pb-2">
      <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} className="flex flex-col h-full">
        <div className="space-y-8 mb-4 pt-1">
          {mode === 'view' && data.cert_number && (
            <div className="flex items-center gap-3">
              <div className="w-24 shrink-0 text-[13px] text-slate-500 font-medium tracking-tight">证书编号</div>
              <div className="flex-1 text-[13px] text-slate-900 font-mono font-medium pl-3">{data.cert_number}</div>
            </div>
          )}
          <div className="flex items-center gap-3">
            <div className="w-24 shrink-0 text-[13px] text-slate-500 font-medium">识别码</div>
            <div className="flex-1">
              {mode === 'view' ? (
                <div className="text-[13px] text-slate-900 font-medium pl-3">{data.platformId}</div>
              ) : (
                <input
                  type="text"
                  placeholder="请输入识别码 (如: 平台 ID) - 选填"
                  className="w-full bg-slate-50/50 px-3 py-2 rounded-lg text-[13px] text-slate-900 font-medium focus:bg-white border border-transparent outline-none focus:ring-1 focus:ring-slate-200 transition-all"
                  value={data.platformId}
                  onChange={(e) => setData({ ...data, platformId: e.target.value })}
                />
              )}
            </div>
          </div>

          {/* 授权主体/经销商 */}
          <div className="flex items-center gap-3">
            <div className="w-24 shrink-0 text-[13px] text-slate-500 font-medium">授权主体</div>
            <div className="flex-1">
              {mode === 'view' ? (
                <div className="text-[13px] text-slate-900 font-medium pl-3">{data.shopName}</div>
              ) : (
                <input
                  type="text"
                  placeholder="请输入授权主体名称"
                  className="w-full bg-slate-50/50 px-3 py-2 rounded-lg text-[13px] text-slate-900 font-medium focus:bg-white border border-transparent outline-none focus:ring-1 focus:ring-slate-200 transition-all"
                  value={data.shopName}
                  onChange={(e) => setData({ ...data, shopName: e.target.value })}
                />
              )}
            </div>
          </div>

          {/* 有效期 */}
          <div className="flex items-center gap-3">
            <div className="w-24 shrink-0 text-[13px] text-slate-500 font-medium">有效期</div>
            <div className="flex-1">
              {mode === 'view' ? (
                <div className="text-[13px] text-slate-900 font-medium tabular-nums pl-3">
                  {data.duration?.replace(/-/g, ' 至 ').replace(/\./g, '/')}
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <input
                    type="date"
                    className="flex-1 bg-slate-50/50 px-2 py-2 rounded-lg text-[13px] text-slate-900 font-medium focus:bg-white border border-transparent outline-none tabular-nums"
                    value={data.duration ? data.duration.substring(0, 10).replace(/\./g, '-') : ""}
                    onChange={(e) => setData({ ...data, duration: `${e.target.value.replace(/-/g, '.')} - ${data.duration.split(' - ')[1] || ""}` })}
                  />
                  <span className="text-slate-300">/</span>
                  <input
                    type="date"
                    className="flex-1 bg-slate-50/50 px-2 py-2 rounded-lg text-[13px] text-slate-900 font-medium focus:bg-white border border-transparent outline-none tabular-nums"
                    value={data.duration ? (data.duration.split(' - ')[1]?.replace(/\./g, '-') || "") : ""}
                    onChange={(e) => setData({ ...data, duration: `${data.duration.split(' - ')[0] || ""} - ${e.target.value.replace(/-/g, '.')}` })}
                  />
                </div>
              )}
            </div>
          </div>

          {/* 联系电话 */}
          <div className="flex items-center gap-3">
            <div className="w-24 shrink-0 text-[13px] text-slate-500 font-medium">联系电话</div>
            <div className="flex-1">
              {mode === 'view' ? (
                <div className="text-[13px] text-slate-900 font-medium font-mono tracking-tight pl-3">{data.phone}</div>
              ) : (
                <input
                  type="tel"
                  className="w-full bg-slate-50/50 px-3 py-2 rounded-lg text-[13px] text-slate-900 font-medium focus:bg-white border border-transparent outline-none focus:ring-1 focus:ring-slate-200 transition-all font-mono"
                  value={data.phone}
                  onChange={(e) => setData({ ...data, phone: e.target.value.replace(/[^\d]/g, '').substring(0, 11) })}
                />
              )}
            </div>
          </div>

          {/* 授权方 */}
          <div className="flex items-center gap-3">
            <div className="w-24 shrink-0 text-[13px] text-slate-500 font-medium">授权方</div>
            <div className="flex-1">
              {mode === 'view' ? (
                <div className="text-[13px] text-slate-900 font-medium pl-3">{data.authorizer}</div>
              ) : (
                <input
                  type="text"
                  placeholder="请输入授权方主体名称"
                  className="w-full bg-slate-50/50 px-3 py-2 rounded-lg text-[13px] text-slate-900 font-medium focus:bg-white border border-transparent outline-none focus:ring-1 focus:ring-slate-200 transition-all"
                  value={data.authorizer}
                  onChange={(e) => setData({ ...data, authorizer: e.target.value })}
                />
              )}
            </div>
          </div>

          {/* 签字盖章 */}
          <div className="flex items-center gap-3">
            <div className="w-24 shrink-0 text-[13px] text-slate-500 font-medium">签字盖章</div>
            <div className="flex-1 flex items-center gap-2 pl-3">
              <div className="w-1.5 h-1.5 rounded-full bg-slate-400" />
              <div className="text-[12px] text-slate-900 font-medium">
                {data.sealImage ? "自定义签章文件" : "使用系统默认公章"}
              </div>
            </div>
          </div>

          {/* 授权业务范围 */}
          <div className="flex items-start gap-3">
            <div className="w-24 shrink-0 text-[13px] text-slate-500 font-medium pt-2">授权业务范围</div>
            <div className="flex-1">
              {mode === 'view' ? (
                <div className="text-[13px] text-slate-900 font-medium leading-relaxed whitespace-pre-wrap py-2 pl-3">{data.scopeText}</div>
              ) : (
                <textarea
                  rows={4}
                  className="w-full bg-slate-50/50 px-3 py-2 rounded-xl text-[13px] text-slate-900 font-medium focus:bg-white border border-transparent outline-none focus:ring-1 focus:ring-slate-200 transition-all resize-none h-28"
                  value={data.scopeText}
                  onChange={(e) => setData({ ...data, scopeText: e.target.value })}
                />
              )}
            </div>
          </div>
        </div>

        <div className="pt-12 pb-2 flex items-center gap-6 flex-wrap">
          {!isVoided && !isIssued && (
            <>
              <button onClick={handleDownload} className="text-slate-600 text-[13px] font-bold hover:text-slate-900 border-b border-transparent hover:border-slate-900 flex items-center gap-2"><Download size={16} /> PNG</button>
              <button onClick={handleDownloadPDF} className="text-slate-600 text-[13px] font-bold hover:text-slate-900 border-b border-transparent hover:border-slate-900 flex items-center gap-2"><File size={16} /> PDF</button>
            </>
          )}
          {mode !== 'view' && (
            <button onClick={handleIssueSubmit} disabled={isSubmitting} className="h-11 px-8 bg-[#2C2A29] text-white rounded-xl text-[13px] font-bold hover:bg-black transition-all shadow-xl active:scale-95">
              {isSubmitting ? "正在提交..." : (mode === 'edit' ? "确认修改" : "签发授权")}
            </button>
          )}
          {isIssued && !isVoided && (
            <div className="flex gap-4">
              <button onClick={handleDownload} className="text-slate-600 text-[13px] font-bold flex items-center gap-2"><Download size={16} /> PNG</button>
              <button onClick={handleDownloadPDF} className="text-slate-600 text-[13px] font-bold flex items-center gap-2"><File size={16} /> PDF</button>
            </div>
          )}
        </div>
      </motion.div>

      <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} className="flex justify-center h-fit">
        <div onClick={handleImagePreview} className="w-full max-w-[460px] shadow-2xl rounded-sm bg-white overflow-hidden ring-1 ring-slate-900/5 cursor-zoom-in relative group">
          <canvas ref={canvasRef} className="w-full h-auto block" style={{ imageRendering: 'crisp-edges' }} />
          <div className="absolute inset-0 bg-slate-900/5 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white"><ZoomIn className="w-6 h-6" /></div>
        </div>
      </motion.div>

      <AnimatePresence>
        {showFullPreview && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center overflow-hidden bg-black/95 backdrop-blur-2xl">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => { setShowFullPreview(false); setZoomScale(1); }} className="absolute inset-0 cursor-zoom-out z-[201]" />
            <motion.div
              initial={{ opacity: 0, y: -20, x: '-50%' }}
              animate={{ opacity: 1, y: 0, x: '-50%' }}
              exit={{ opacity: 0, y: -20, x: '-50%' }}
              className="absolute top-10 left-1/2 z-[210] flex items-center h-12 px-2 bg-black/60 border border-white/5 rounded-full backdrop-blur-2xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] pointer-events-auto"
              onClick={(e) => e.stopPropagation()}
            >
              {/* 缩放控制组 */}
              <div className="flex items-center px-2">
                <button
                  onClick={() => setZoomScale(Math.max(0.2, zoomScale - 0.2))}
                  className="w-8 h-8 flex items-center justify-center text-white/40 hover:text-white transition-all active:scale-90"
                >
                  <ZoomOut size={15} />
                </button>
                <div className="min-w-[54px] text-center text-[12px] font-bold text-white tabular-nums tracking-tight">
                  {(zoomScale * 100).toFixed(0)}%
                </div>
                <button
                  onClick={() => setZoomScale(Math.min(5, zoomScale + 0.2))}
                  className="w-8 h-8 flex items-center justify-center text-white/40 hover:text-white transition-all active:scale-90"
                >
                  <ZoomIn size={15} />
                </button>
              </div>

              <div className="w-px h-4 bg-white/10" />

              {/* 重置组 */}
              <button
                onClick={() => setZoomScale(1)}
                className="px-4 h-full text-[12px] font-bold text-white/40 hover:text-white transition-all active:opacity-60"
              >
                100%
              </button>

              <div className="w-px h-4 bg-white/10" />

              {/* 操作组 */}
              <div className="flex items-center pl-3 pr-1 gap-2">
                <button
                  onClick={(e) => { e.stopPropagation(); handleDownload(); }}
                  className="flex items-center gap-2 px-4 h-8 bg-white text-black rounded-full text-[12px] font-bold hover:bg-slate-200 transition-all active:scale-95 whitespace-nowrap"
                >
                  <Download size={14} strokeWidth={2.5} /> 保存图片
                </button>

                <button
                  onClick={() => { setShowFullPreview(false); setZoomScale(1); }}
                  className="w-8 h-8 flex items-center justify-center text-white/30 hover:text-red-400 hover:bg-white/5 rounded-full transition-all"
                >
                  <X size={16} />
                </button>
              </div>
            </motion.div>
            <div className="w-full h-full flex items-center justify-center overflow-hidden touch-none" onWheel={(e) => setZoomScale(prev => e.deltaY < 0 ? Math.min(5, prev + 0.1) : Math.max(0.2, prev - 0.1))}>
              <motion.div drag dragConstraints={{ left: -1200, right: 1200, top: -1200, bottom: 1200 }} animate={{ scale: zoomScale }} transition={{ type: "spring", damping: 30, stiffness: 200 }} className="relative z-[205]">
                <img src={previewImageUrl} className="max-w-[85vw] max-h-[85vh] object-contain shadow-2xl rounded-sm pointer-events-none select-none ring-1 ring-white/10" alt="HD" />
              </motion.div>
            </div>

          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

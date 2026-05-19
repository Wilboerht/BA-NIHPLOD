"use client";

import React, { useRef, useState, useEffect } from "react";
import { Download, CheckCircle2, XCircle, X, ZoomIn, ZoomOut, File, FileImage } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import jsPDF from 'jspdf';
import QRCode from "qrcode";
import { useToast } from "@/hooks/useToast";

export interface CertData {
  id?: string;
  companyName: string;
  companyLabel: string;
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
  const { toast } = useToast();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [data, setData] = useState<CertData>({
    companyName: "",
    companyLabel: "公司名称",
    shopName: "",
    shopLabel: "店铺名称",
    scopeText: "予以下渠道:\n淘宝 | 天猫 | 京东 | 小红书 | 抖音 | 微信 | 线下门店\n运营我司代理的品牌NIHPLOD(旎柏)\n全系列产品的[合格经销资格]\n负责该品牌产品在上述相关渠道的商务推广及售后服务",
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
  const tempCertNumberRef = useRef(`BAVP-${new Date().getFullYear()}-${crypto.randomUUID().replace(/-/g, '').substring(0, 4).toUpperCase()}`);

  const [userRole, setUserRole] = useState<string | null>(null);

  useEffect(() => {
    const fetchUserRole = async () => {
      try {
        const res = await fetch('/api/auth/me');
        if (res.ok) {
          const data = await res.json();
          setUserRole(data.user?.role || 'AUDITOR');
        }
      } catch (err) {
        console.warn("Failed to fetch user role:", err);
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

  // 预设渠道列表
  const CHANNELS = ['淘宝', '天猫', '京东', '小红书', '抖音', '微信', '线下门店', '其他'];

  const [customChannel, setCustomChannel] = useState('');

  // 从 scopeText 解析选中的预设渠道
  const getChannelsFromScopeText = (text: string): string[] => {
    const lines = text.split('\n');
    if (lines.length >= 2) {
      const items = lines[1].split(/\s*\|\s*/).filter(Boolean);
      return CHANNELS.filter(ch => items.includes(ch));
    }
    return [];
  };

  // 从 scopeText 解析自定义渠道内容
  const getCustomChannel = (text: string): string => {
    const lines = text.split('\n');
    if (lines.length >= 2) {
      const items = lines[1].split(/\s*\|\s*/).filter(Boolean);
      const presetSet = new Set(CHANNELS);
      const custom = items.find(item => !presetSet.has(item));
      return custom || '';
    }
    return '';
  };

  const updateScopeTextChannels = (text: string, channels: string[], custom: string): string => {
    const lines = text.split('\n');
    if (lines.length >= 2) {
      const items = channels.filter(ch => ch !== '其他');
      if (channels.includes('其他')) {
        if (custom.trim()) {
          items.push(custom.trim());
        } else {
          items.push('其他');
        }
      }
      lines[1] = items.join(' | ');
    }
    return lines.join('\n');
  };

  const toggleChannel = (channel: string) => {
    const current = getChannelsFromScopeText(data.scopeText);
    const next = current.includes(channel)
      ? current.filter(c => c !== channel)
      : [...current, channel];
    const newText = updateScopeTextChannels(data.scopeText, next, customChannel);
    setData(prev => ({ ...prev, scopeText: newText }));
  };

  // 从已有证书加载时解析自定义渠道
  useEffect(() => {
    if (initialData?.scopeText) {
      setCustomChannel(getCustomChannel(initialData.scopeText));
    }
  }, [initialData]);

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
        img.crossOrigin = 'anonymous';
        img.src = src;
        img.onload = () => resolve(img);
        img.onerror = () => resolve(null);
      });
    };

    const [bgImage, sealImg] = await Promise.all([
      loadImage("/cert-template.svg"),
      data.sealImage ? loadImage(data.sealImage) : loadImage("/default-seal.png")
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
    const leftMargin = 210 * scale;
    const maxTextWidth = width - leftMargin - 60 * scale;

    // 文字自动换行辅助函数
    const wrapText = (ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] => {
      const chars = text.split('');
      const lines: string[] = [];
      let currentLine = '';
      for (const char of chars) {
        const testLine = currentLine + char;
        if (ctx.measureText(testLine).width > maxW && currentLine !== '') {
          lines.push(currentLine);
          currentLine = char;
        } else {
          currentLine = testLine;
        }
      }
      if (currentLine) lines.push(currentLine);
      return lines;
    };

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

    let currentY = 500 * scale;

    // 店铺名称（大字加粗，仅显示输入值）
    offCtx.font = `bold ${22 * scale}px "Noto Serif SC", serif`;
    offCtx.fillStyle = "#1e293b";
    if (data.shopName) {
      const shopLines = wrapText(offCtx, data.shopName, maxTextWidth);
      shopLines.forEach(line => {
        offCtx.fillText(line, leftMargin, currentY);
        currentY += 38 * scale;
      });
    }

    // 公司名称（大字加粗，仅显示输入值）
    if (data.companyName) {
      const companyLines = wrapText(offCtx, data.companyName, maxTextWidth);
      companyLines.forEach(line => {
        offCtx.fillText(line, leftMargin, currentY);
        currentY += 38 * scale;
      });
    }

    currentY += 28 * scale;

    // 授权业务范围
    offCtx.font = `400 ${15 * scale}px "Noto Serif SC", serif`;
    offCtx.fillStyle = textPrimary;
    const scopeLines = (data.scopeText || "").split('\n');

    scopeLines.forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed) {
        currentY += 20 * scale;
        return;
      }
      const parts = parseMarkdownBold(trimmed);
      const plainText = parts.map(p => p.text).join('');
      const plainWidth = offCtx.measureText(plainText).width;

      if (plainWidth <= maxTextWidth) {
        // 无需换行
        if (parts.some(p => p.bold)) {
          let currentX = leftMargin;
          parts.forEach(part => {
            offCtx.font = part.bold ? `bold ${15 * scale}px "Noto Serif SC", serif` : `400 ${15 * scale}px "Noto Serif SC", serif`;
            offCtx.fillText(part.text, currentX, currentY);
            currentX += offCtx.measureText(part.text).width;
          });
        } else {
          offCtx.fillText(trimmed, leftMargin, currentY);
        }
        currentY += 30 * scale;
      } else {
        // 需要换行：按字符构建 bold 映射后逐字换行
        const charList: { text: string; bold: boolean }[] = [];
        parts.forEach(p => { for (const c of p.text) charList.push({ text: c, bold: p.bold }); });

        const wrappedLines: typeof charList[] = [];
        let curLine: typeof charList = [];
        let curWidth = 0;
        for (const item of charList) {
          offCtx.font = item.bold ? `bold ${15 * scale}px "Noto Serif SC", serif` : `400 ${15 * scale}px "Noto Serif SC", serif`;
          const w = offCtx.measureText(item.text).width;
          if (curWidth + w > maxTextWidth && curLine.length > 0) {
            wrappedLines.push(curLine);
            curLine = [item];
            curWidth = w;
          } else {
            curLine.push(item);
            curWidth += w;
          }
        }
        if (curLine.length > 0) wrappedLines.push(curLine);

        for (const wl of wrappedLines) {
          let currentX = leftMargin;
          let i = 0;
          while (i < wl.length) {
            const isBold = wl[i].bold;
            let segment = '';
            while (i < wl.length && wl[i].bold === isBold) {
              segment += wl[i].text;
              i++;
            }
            offCtx.font = isBold ? `bold ${15 * scale}px "Noto Serif SC", serif` : `400 ${15 * scale}px "Noto Serif SC", serif`;
            offCtx.fillText(segment, currentX, currentY);
            currentX += offCtx.measureText(segment).width;
          }
          currentY += 30 * scale;
        }
      }
    });

    const formatDate = (dateStr: string) => {
      if (!dateStr) return "";
      const parts = dateStr.split('.');
      return parts.length === 3 ? `${parts[0]}年${parts[1]}月${parts[2]}日` : dateStr;
    };
    const dateRange = data.duration.split(' - ');
    offCtx.textAlign = "left";
    offCtx.font = `400 ${15 * scale}px "Noto Serif SC", serif`;
    offCtx.fillText(`授权有效期：${formatDate(dateRange[0])}至${formatDate(dateRange[1])}`, leftMargin, currentY + 25 * scale);
    currentY += 50 * scale;

    // 预计算公章尺寸和中心位置
    let sealCenterX = width - 260 * scale;
    let sealDrawWidth = 160 * scale;
    let sealDrawHeight = 160 * scale;
    if (sealImg) {
      const maxSealSize = 160 * scale;
      const aspect = sealImg.width / sealImg.height;
      sealDrawWidth = aspect > 1 ? maxSealSize : maxSealSize * aspect;
      sealDrawHeight = aspect > 1 ? maxSealSize / aspect : maxSealSize;
      sealCenterX = width - 210 * scale - sealDrawWidth / 2;
    }

    // 计算二维码和公章的底部对齐位置：靠近画布底部，同时确保不与上方文字重叠
    const qrSize = 100 * scale;
    const bottomAlignY = Math.min(
      Math.max(currentY + 140 * scale, height - 120 * scale),
      height - 30 * scale
    );

    // 授权方文字（跟随公章位置，固定在公章上方）
    offCtx.textAlign = "left";
    offCtx.font = `500 ${14 * scale}px "Noto Serif SC", serif`;
    offCtx.fillText(data.authorizer || "", sealCenterX - 85 * scale, bottomAlignY - sealDrawHeight - 16 * scale);

    // 证书编号
    const certNumber = (initialData?.cert_number as string) || tempCertNumberRef.current;
    if (certNumber) {
      offCtx.textAlign = "right";
      offCtx.font = `400 ${12 * scale}px "Noto Serif SC", serif`;
      offCtx.fillStyle = "#666666";
      offCtx.fillText(`证书号：${certNumber}`, width - 40 * scale, height - 30 * scale);
    }

    // 公章：底部对齐
    if (sealImg) {
      offCtx.save();
      offCtx.translate(sealCenterX, bottomAlignY - sealDrawHeight / 2);
      offCtx.rotate(-0.06);
      offCtx.globalAlpha = 0.88;
      offCtx.drawImage(sealImg, -sealDrawWidth / 2, -sealDrawHeight / 2, sealDrawWidth, sealDrawHeight);
      offCtx.restore();
    }

    // 二维码：底部对齐（与公章同一水平线）
    const qrX = leftMargin;
    const qrY = bottomAlignY - qrSize;
    try {
      const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || (typeof window !== 'undefined' ? window.location.origin : '');
      const verifyUrl = `${baseUrl}/verify?cert=${encodeURIComponent(certNumber || '')}`;
      const qrDataUrl = await QRCode.toDataURL(verifyUrl, {
        width: 80,
        margin: 1,
        color: { dark: '#000000', light: '#ffffff' },
        errorCorrectionLevel: 'M'
      });
      const qrImg = await loadImage(qrDataUrl);
      if (qrImg) {
        offCtx.drawImage(qrImg, qrX, qrY, qrSize, qrSize);
        offCtx.font = `500 ${11 * scale}px "Noto Serif SC", serif`;
        offCtx.fillStyle = "#666666";
        offCtx.textAlign = "center";
        offCtx.fillText("官方扫码验证", qrX + qrSize / 2, bottomAlignY + 16 * scale);
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
      toast({ message: "PDF 下载失败：" + (err instanceof Error ? err.message : "未知错误"), type: "error" });
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
      toast({ message: "请填写必填字段：店铺名称", type: "warning" });
      return;
    }
    setIsSubmitting(true);
    try {
      const meRes = await fetch('/api/auth/me');
      if (!meRes.ok) throw new Error("未找到登录信息");
      const meData = await meRes.json();
      const user = meData.user;
      const isManager = ['SUPER_ADMIN', 'PROJECT_MANAGER', 'MANAGER'].includes(user?.role);

      const response = await fetch("/api/certificates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: mode === 'edit' ? "update_certificate" : (isManager ? "approve_issue" : "create_pending"),
          certId: initialData?.id,
          certData: { ...data, cert_number: initialData?.cert_number || tempCertNumberRef.current },
          managerId: user?.id
        })
      });

      if (!response.ok) throw new Error("操作失败");
      toast({ message: mode === 'edit' ? "授权信息已更新" : "证书已处理", type: "success" });
      setIsIssued(true);
      if (onSuccess) setTimeout(onSuccess, 800);
    } catch (err: unknown) {
      toast({ message: "操作失败：" + (err instanceof Error ? err.message : "未知错误"), type: "error" });
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
          {/* 店铺名称/经销商 */}
          <div className="flex items-center gap-3">
            <div className="w-24 shrink-0 text-[13px] text-slate-500 font-medium">店铺名称</div>
            <div className="flex-1">
              {mode === 'view' ? (
                <div className="text-[13px] text-slate-900 font-medium pl-3">{data.shopName}</div>
              ) : (
                <input
                  type="text"
                  placeholder="请输入店铺名称"
                  className="w-full bg-slate-50/50 px-3 py-2 rounded-lg text-[13px] text-slate-900 font-medium focus:bg-white border border-transparent outline-none focus:ring-1 focus:ring-slate-200 transition-all"
                  value={data.shopName}
                  onChange={(e) => setData({ ...data, shopName: e.target.value })}
                />
              )}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="w-24 shrink-0 text-[13px] text-slate-500 font-medium">公司名称</div>
            <div className="flex-1">
              {mode === 'view' ? (
                <div className="text-[13px] text-slate-900 font-medium pl-3">{data.companyName}</div>
              ) : (
                <input
                  type="text"
                  placeholder="请输入公司名称（如：广东省某某公司）- 选填"
                  className="w-full bg-slate-50/50 px-3 py-2 rounded-lg text-[13px] text-slate-900 font-medium focus:bg-white border border-transparent outline-none focus:ring-1 focus:ring-slate-200 transition-all"
                  value={data.companyName}
                  onChange={(e) => setData({ ...data, companyName: e.target.value })}
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
          <div className="flex items-start gap-3">
            <div className="w-24 shrink-0 text-[13px] text-slate-500 font-medium pt-2">签字盖章</div>
            <div className="flex-1 pl-3">
              {mode === 'view' ? (
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                  <div className="text-[12px] text-slate-900 font-medium">
                    {data.sealImage ? "自定义签章文件" : "使用系统默认公章"}
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center gap-3">
                    <label className="inline-flex items-center gap-2 px-3 py-1.5 bg-slate-50 hover:bg-slate-100 text-slate-600 text-[12px] font-bold rounded-lg cursor-pointer transition-all border border-slate-100">
                      <FileImage className="w-3.5 h-3.5" />
                      {data.sealImage ? "更换签章" : "上传自定义签章"}
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        className="hidden"
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
                          const MAX_SIZE = 2 * 1024 * 1024;
                          if (!ALLOWED_TYPES.includes(file.type)) {
                            toast({ message: '仅支持 PNG/JPG/WebP 格式', type: 'error' });
                            return;
                          }
                          if (file.size > MAX_SIZE) {
                            toast({ message: '图片大小不能超过 2MB', type: 'error' });
                            return;
                          }
                          try {
                            const formData = new FormData();
                            formData.append('file', file);
                            const res = await fetch('/api/upload', {
                              method: 'POST',
                              body: formData
                            });
                            if (!res.ok) {
                              const data = await res.json();
                              throw new Error(data.error || '上传失败');
                            }
                            const { url } = await res.json();
                            setData(prev => ({ ...prev, sealImage: url }));
                            toast({ message: '签章上传成功', type: 'success' });
                          } catch (err: unknown) {
                            toast({ message: '签章上传失败：' + (err instanceof Error ? err.message : '未知错误'), type: 'error' });
                          }
                        }}
                      />
                    </label>
                    {data.sealImage && (
                      <button
                        onClick={() => setData({ ...data, sealImage: "" })}
                        className="text-[11px] text-slate-400 hover:text-rose-500 font-bold transition-colors"
                      >
                        恢复默认公章
                      </button>
                    )}
                  </div>
                  {data.sealImage && (
                    <img src={data.sealImage} alt="预览签章" className="w-12 h-12 object-contain rounded border border-slate-100 bg-white" />
                  )}
                  <div className="text-[11px] text-slate-400">
                    {data.sealImage ? "已使用自定义签章" : "使用系统默认公章（旎柏官方公章）"}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* 授权业务范围 */}
          <div className="flex items-start gap-3">
            <div className="w-24 shrink-0 text-[13px] text-slate-500 font-medium pt-2">授权业务范围</div>
            <div className="flex-1">
              {mode === 'view' ? (
                <div className="text-[13px] text-slate-900 font-medium leading-relaxed whitespace-pre-wrap py-2 pl-3">{data.scopeText}</div>
              ) : (
                <>
                  <div className="flex flex-wrap gap-2 mb-3 items-center">
                    {CHANNELS.map(channel => {
                      const isSelected = getChannelsFromScopeText(data.scopeText).includes(channel);
                      return (
                        <button
                          key={channel}
                          type="button"
                          onClick={() => toggleChannel(channel)}
                          className={`px-3 py-1.5 rounded-lg text-[12px] font-bold transition-all border ${
                            isSelected
                              ? 'bg-slate-900 text-white border-slate-900'
                              : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
                          }`}
                        >
                          {channel}
                        </button>
                      );
                    })}
                    {getChannelsFromScopeText(data.scopeText).includes('其他') && (
                      <input
                        type="text"
                        placeholder="请输入其他渠道"
                        value={customChannel}
                        onChange={(e) => {
                          const val = e.target.value;
                          setCustomChannel(val);
                          const current = getChannelsFromScopeText(data.scopeText);
                          const newText = updateScopeTextChannels(data.scopeText, current, val);
                          setData(prev => ({ ...prev, scopeText: newText }));
                        }}
                        className="flex-1 min-w-[120px] bg-white px-3 py-1.5 rounded-lg text-[12px] text-slate-900 font-medium border border-slate-200 outline-none focus:border-slate-400 transition-all"
                      />
                    )}
                  </div>
                  <textarea
                    rows={4}
                    className="w-full bg-slate-50/50 px-3 py-2 rounded-xl text-[13px] text-slate-900 font-medium focus:bg-white border border-transparent outline-none focus:ring-1 focus:ring-slate-200 transition-all resize-none h-28"
                    value={data.scopeText}
                    onChange={(e) => setData({ ...data, scopeText: e.target.value })}
                  />
                </>
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

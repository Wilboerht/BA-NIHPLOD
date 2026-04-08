"use client";

import React, { useRef, useState, useEffect } from "react";
import { Download, RefreshCw, FileText, CheckCircle2, XCircle, Type, Move, Printer, ChevronDown, X, ZoomIn, File } from "lucide-react";
import { motion } from "framer-motion";
import { supabase } from "@/lib/supabase";
import jsPDF from 'jspdf';

interface CertData {
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

import QRCode from "qrcode";

interface CertificateGeneratorProps {
  initialData?: any;
  mode?: 'create' | 'view';
  isVoided?: boolean;
}

export default function CertificateGenerator({ initialData, mode = 'create', isVoided: initialVoided = false }: CertificateGeneratorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scopeRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [data, setData] = useState<CertData>({
    platformId: "",
    platformLabel: "淘宝ID",
    shopName: "",
    shopLabel: "店铺名称",
    scopeText: "拥有我公司代理的品牌 **NIHPLOD(旎柏)** 全系列产品\n在阿里巴巴集团旗下淘宝商城上的 **合格经销资格**，\n负责该品牌产品在网站内一切相关的商务推广及售后服务。",
    duration: `${new Date().getFullYear()}.${String(new Date().getMonth() + 1).padStart(2, '0')}.${String(new Date().getDate()).padStart(2, '0')} - ${new Date().getFullYear() + 1}.${String(new Date().getMonth() + 1).padStart(2, '0')}.${String(new Date().getDate()).padStart(2, '0')}`,
    authorizer: "旎柏（上海）商贸有限公司",
    sealImage: "",
    phone: "",
  });

  const [isGenerating, setIsGenerating] = useState(false);
  const [isFontLoaded, setIsFontLoaded] = useState(false);
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);
  const [showFullPreview, setShowFullPreview] = useState(false);
  const [previewImageUrl, setPreviewImageUrl] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isIssued, setIsIssued] = useState(false);
  const [isVoided, setIsVoided] = useState(initialVoided);
  const [isDownloading, setIsDownloading] = useState(false);
  const [sealFileName, setSealFileName] = useState<string | null>(null);
  
  const renderRequestId = useRef(0);
  const tempCertNumberRef = useRef(`BAVP-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`);

  const platformOptions = ["淘宝ID", "京东ID", "拼多多ID", "抖音号", "快手ID", "小红书账号", "得物账号"];
  const shopOptions = ["店铺名称", "专柜名称", "授权店名称", "直播间名称", "机构名称"];

  const [userRole, setUserRole] = useState<string | null>(null);

  useEffect(() => {
    fetchUserRole();
  }, []);

  const fetchUserRole = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
      setUserRole(profile?.role || 'AUDITOR');
    }
  };

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

  useEffect(() => {
    renderCertificate();
  }, [data, isFontLoaded]);

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
    
    const idFullLine = `${data.platformLabel || "淘宝ID"}：${data.platformId || ""}`;
    const shopFullLine = `${data.shopLabel || "店铺名称"}：${data.shopName || ""}`;
    offCtx.fillText(idFullLine, width / 2, 530 * scale);
    offCtx.fillText(shopFullLine, width / 2, 578 * scale);

    offCtx.font = `400 ${15 * scale}px "Noto Serif SC", serif`;
    offCtx.fillStyle = textPrimary;
    const scopeLines = (data.scopeText || "").split('\n');
    let startY = 630 * scale; 
    
    // 解析 Markdown 加粗语法 (**text**)
    const parseMarkdownBold = (line: string) => {
      const parts = [];
      const regex = /\*\*(.*?)\*\*/g;
      let lastIndex = 0;
      let match;
      
      while ((match = regex.exec(line)) !== null) {
        // 加粗前的文本
        if (match.index > lastIndex) {
          parts.push({ text: line.substring(lastIndex, match.index), bold: false });
        }
        // 加粗的文本
        parts.push({ text: match[1], bold: true });
        lastIndex = regex.lastIndex;
      }
      
      // 加粗后的剩余文本
      if (lastIndex < line.length) {
        parts.push({ text: line.substring(lastIndex), bold: false });
      }
      
      return parts.length > 0 ? parts : [{ text: line, bold: false }];
    };
    
    scopeLines.forEach((line) => {
      const parts = parseMarkdownBold(line.trim());
      
      if (parts.some(p => p.bold)) {
        // 有加粗内容，需要计算宽度并分段绘制
        let totalWidth = 0;
        parts.forEach(part => {
          offCtx.font = part.bold ? `bold ${15 * scale}px "Noto Serif SC", serif` : `400 ${15 * scale}px "Noto Serif SC", serif`;
          totalWidth += offCtx.measureText(part.text).width;
        });
        
        let currentX = (width - totalWidth) / 2;
        offCtx.textAlign = "left";
        
        parts.forEach(part => {
          offCtx.font = part.bold ? `bold ${15 * scale}px "Noto Serif SC", serif` : `400 ${15 * scale}px "Noto Serif SC", serif`;
          offCtx.fillText(part.text, currentX, startY);
          currentX += offCtx.measureText(part.text).width;
        });
      } else {
        // 没有加粗内容，居中绘制
        offCtx.textAlign = "center";
        offCtx.font = `400 ${15 * scale}px "Noto Serif SC", serif`;
        offCtx.fillText(line.trim(), width / 2, startY);
      }
      startY += 30 * scale;
    });

    const formatDate = (dateStr: string) => {
      if (!dateStr) return "";
      const parts = dateStr.split('.');
      return parts.length === 3 ? `${parts[0]}年${parts[1]}月${parts[2]}日` : dateStr;
    };
    const dateRange = data.duration.split(' - ');
    offCtx.textAlign = "center";
    offCtx.font = `400 ${15 * scale}px "Noto Serif SC", serif`;
    offCtx.fillText(`授权有效期：${formatDate(dateRange[0])}至${formatDate(dateRange[1])}`, width / 2, startY + 25 * scale);

    offCtx.textAlign = "left";
    offCtx.font = `500 ${14 * scale}px "Noto Serif SC", serif`;
    offCtx.fillText(`授权方：${data.authorizer || ""}`, width - 435 * scale, 848 * scale);
    offCtx.fillText("签字/盖章：", width - 435 * scale, 892 * scale);

    // 显示证书编号
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
      offCtx.translate(width - 280 * scale, 875 * scale);
      offCtx.rotate(-0.06); 
      offCtx.globalAlpha = 0.88;
      offCtx.drawImage(sealImg, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);
      offCtx.restore();
    }

    // 生成并绘制二维码
    try {
      const certNumber = (initialData?.cert_number as string) || tempCertNumberRef.current;
      // 使用相对路径，避免硬编码域名
      const verifyUrl = `/verify?cert=${encodeURIComponent(certNumber)}`;
      const qrDataUrl = await QRCode.toDataURL(verifyUrl, {
        width: 80,  // 固定尺寸 80px，不根据 scale 缩放
        margin: 1,
        color: { dark: '#000000', light: '#ffffff' },
        errorCorrectionLevel: 'M'  // 改为 M 级别，足以应对二维码被部分遮挡
      });
      
      const qrImg = await loadImage(qrDataUrl);
      if (qrImg) {
        const qrSize = 100 * scale;  // 保持缩放，但基数减小
        const qrX = 210 * scale; // 从左边向内移动
        const qrY = height - 320 * scale; // 距离底部
        offCtx.drawImage(qrImg, qrX, qrY, qrSize, qrSize);
        
        // 添加二维码标签
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
        offCtx.restore(); 
        offCtx.save();
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
        if (canvas.width !== width || canvas.height !== height) {
            canvas.width = width;
            canvas.height = height;
        }
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

      // canvas 尺寸：800x1131 (实际 1600x2262)
      const imgData = canvas.toDataURL("image/png");
      const pdfWidth = 210; // A4 宽度 mm
      const pdfHeight = 297; // A4 高度 mm
      
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
      });

      // 计算缩放后的尺寸（限制在 A4 页面内）
      const maxWidth = pdfWidth - 10; // 留出边距
      const maxHeight = pdfHeight - 10;
      
      let imgWidth = maxWidth;
      let imgHeight = (maxWidth * canvas.height) / canvas.width;
      
      if (imgHeight > maxHeight) {
        imgHeight = maxHeight;
        imgWidth = (maxHeight * canvas.width) / canvas.height;
      }

      const x = (pdfWidth - imgWidth) / 2;
      const y = (pdfHeight - imgHeight) / 2;

      pdf.addImage(imgData, 'PNG', x, y, imgWidth, imgHeight);
      
      const fileName = `授权书_${data.shopName}.pdf`;
      pdf.save(fileName);
    } catch (err: any) {
      alert("PDF 下载失败：" + err.message);
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
  
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSealFileName(file.name);
      const reader = new FileReader();
      reader.onload = (event) => {
        const result = event.target?.result as string;
        setData({ ...data, sealImage: result });
      };
      reader.readAsDataURL(file);
    }
  };

  const handleIssueSubmit = async () => {
    if (!data.platformId || !data.shopName || !data.phone) {
      alert("请填写完整的基本信息（平台ID、店铺名称、联系电话）");
      return;
    }

    setIsSubmitting(true);
    try {
      const canvas = canvasRef.current;
      if (!canvas) throw new Error("证书图像生成失败");

      const certImageDataUrl = canvas.toDataURL("image/png");
      const certNumber = tempCertNumberRef.current;

      const { data: { user } } = await supabase.auth.getUser();
      
      // 获取当前用户的role
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', user?.id).single();
      const userRole = profile?.role;
      
      // 判断是否为负责人级别的角色
      const isManager = ['SUPER_ADMIN', 'PROJECT_MANAGER', 'MANAGER'].includes(userRole);
      
      const response = await fetch("/api/certificates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: isManager ? "approve_issue" : "create_pending",  // 负责人直接核发，否则待审核
          certData: {
            ...data,
            cert_number: certNumber
          },
          managerId: user?.id
        })
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "签发失败");

      if (isManager) {
        alert(`✅ 证书已签发\n证书号：${certNumber}\n\n经销商账户已开通，可直接登陆。`);
      } else {
        alert(`✅ 证书已提报\n证书号：${certNumber}\n\n请等待负责人审核并核发。`);
      }
      setIsIssued(true);
    } catch (err: any) {
      alert("签发失败：" + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="grid lg:grid-cols-[400px_1fr] gap-12 items-start h-full pb-2">
      {/* 控制面板 */}
      <motion.div
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        className="flex flex-col h-full pl-2 px-1"
      >
        <div className="space-y-8 mb-4">
          {/* 证书编号 - 仅在查看模式下显示 */}
          {mode === 'view' && data.cert_number && (
            <div className="flex items-center gap-3">
              <div className="w-24 shrink-0 text-[13px] text-slate-500 font-medium">证书编号</div>
              <div className="flex-1 text-[13px] text-slate-900 font-mono font-medium">{data.cert_number}</div>
            </div>
          )}

          {/* 属性 1：平台ID */}
          <div className="flex items-center gap-3">
            <div className="w-24 shrink-0">
              {mode === 'view' ? (
                <div className="text-[13px] text-slate-500 font-medium">{data.platformLabel || "淘宝ID"}</div>
              ) : (
                <div className="relative -ml-2 group/label">
                  <div 
                    className="flex items-center gap-1.5 hover:bg-slate-50 px-2 py-1.5 rounded-lg transition-colors cursor-pointer"
                    onClick={() => setActiveDropdown(activeDropdown === 'platform' ? null : 'platform')}
                  >
                    <span className="text-[13px] text-slate-500 font-medium truncate flex-1">
                      {data.platformLabel || "名称"}
                    </span>
                    <ChevronDown className={`w-3.5 h-3.5 text-slate-300 transition-transform duration-200 ${activeDropdown === 'platform' ? 'rotate-180 text-blue-500' : 'group-hover/label:text-slate-400'}`} />
                  </div>
                  {activeDropdown === 'platform' && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setActiveDropdown(null)} />
                      <div className="absolute left-0 mt-1 w-48 bg-white rounded-xl shadow-xl border border-slate-100 overflow-hidden z-20">
                        <div className="px-3 py-2 bg-slate-50/80 border-b border-slate-100 italic text-[10px]">自定义输入...</div>
                        <input className="w-full px-3 py-1.5 text-xs outline-none" value={data.platformLabel} onChange={(e) => setData({ ...data, platformLabel: e.target.value })} />
                        {platformOptions.map(opt => (
                          <button key={opt} className="w-full px-3 py-2 text-left text-[13px] hover:bg-slate-50" onClick={() => { setData({ ...data, platformLabel: opt }); setActiveDropdown(null); }}>{opt}</button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
            <div className="flex-1">
              {mode === 'view' ? (
                <div className="text-[13px] text-slate-900 font-medium">{data.platformId}</div>
              ) : (
                <input
                  type="text"
                  placeholder="请输入 ID"
                  className="w-full bg-slate-50/50 px-3 py-2 rounded-lg text-[13px] text-slate-900 font-medium focus:bg-white focus:ring-1 focus:ring-slate-200 border border-transparent outline-none transition-all"
                  value={data.platformId}
                  onChange={(e) => setData({ ...data, platformId: e.target.value })}
                />
              )}
            </div>
          </div>

          {/* 属性 2：店铺名称 */}
          <div className="flex items-center gap-3">
            <div className="w-24 shrink-0">
              {mode === 'view' ? (
                <div className="text-[13px] text-slate-500 font-medium">{data.shopLabel || "店铺名称"}</div>
              ) : (
                <div className="relative -ml-2 group/label">
                  <div 
                    className="flex items-center gap-1.5 hover:bg-slate-50 px-2 py-1.5 rounded-lg transition-colors cursor-pointer"
                    onClick={() => setActiveDropdown(activeDropdown === 'shop' ? null : 'shop')}
                  >
                    <span className="text-[13px] text-slate-500 font-medium truncate flex-1">{data.shopLabel || "名称"}</span>
                    <ChevronDown className="w-3.5 h-3.5 text-slate-300" />
                  </div>
                  {activeDropdown === 'shop' && (
                    <div className="absolute left-0 mt-1 w-48 bg-white rounded-xl shadow-xl border border-slate-100 z-20">
                       {shopOptions.map(opt => (
                        <button key={opt} className="w-full px-3 py-2 text-left text-[13px] hover:bg-slate-50" onClick={() => { setData({ ...data, shopLabel: opt }); setActiveDropdown(null); }}>{opt}</button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="flex-1">
               {mode === 'view' ? (
                <div className="text-[13px] text-slate-900 font-medium">{data.shopName}</div>
              ) : (
                <input
                  type="text"
                  placeholder="请输入名称"
                  className="w-full bg-slate-50/50 px-3 py-2 rounded-lg text-[13px] text-slate-900 font-medium focus:bg-white focus:ring-1 focus:ring-slate-200 border border-transparent outline-none transition-all"
                  value={data.shopName}
                  onChange={(e) => setData({ ...data, shopName: e.target.value })}
                />
              )}
            </div>
          </div>

          {/* 属性 3：有效期 */}
          <div className="flex items-center gap-3">
            <div className="w-24 text-[13px] text-slate-500 font-medium">有效期</div>
            <div className="flex-1">
              {mode === 'view' ? (
                <div className="text-[13px] text-slate-900 font-medium">
                  {data.duration?.replace(/-/g, ' 至 ').replace(/\./g, '/')}
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <input 
                    type="date" 
                    className="w-[135px] bg-slate-50/50 px-2.5 py-2 rounded-lg text-[13px] text-slate-900 font-medium focus:bg-white focus:ring-1 focus:ring-slate-200 border border-transparent outline-none transition-all tabular-nums" 
                    value={data.duration ? data.duration.substring(0, 10).replace(/\./g, '-') : ""} 
                    onChange={(e) => setData({ ...data, duration: `${e.target.value.replace(/-/g, '.')} - ${data.duration.split(' - ')[1] || ""}` })} 
                  />
                  <span className="text-slate-300">/</span>
                  <input 
                    type="date" 
                    className="w-[135px] bg-slate-50/50 px-2.5 py-2 rounded-lg text-[13px] text-slate-900 font-medium focus:bg-white focus:ring-1 focus:ring-slate-200 border border-transparent outline-none transition-all tabular-nums" 
                    value={data.duration ? (data.duration.split(' - ')[1]?.replace(/\./g, '-') || "") : ""} 
                    onChange={(e) => setData({ ...data, duration: `${data.duration.split(' - ')[0] || ""} - ${e.target.value.replace(/-/g, '.')}` })} 
                  />
                </div>
              )}
            </div>
          </div>

          {/* 属性：联系电话 */}
          <div className="flex items-center gap-3">
            <div className="w-24 text-[13px] text-slate-500 font-medium">联系电话</div>
            <div className="flex-1">
              {mode === 'view' ? (
                <div className="text-[13px] text-slate-900 font-medium tabular-nums">{data.phone}</div>
              ) : (
                <input 
                  type="tel" 
                  className="w-full bg-slate-50/50 px-3 py-2 rounded-lg text-[13px] text-slate-900 font-medium focus:bg-white focus:ring-1 focus:ring-slate-200 border border-transparent outline-none transition-all tabular-nums" 
                  value={data.phone} 
                  onChange={(e) => {
                    const val = e.target.value.replace(/[^\d]/g, '').substring(0, 11);
                    setData({ ...data, phone: val });
                  }} 
                  placeholder="11位中国大陆手机号码" 
                />
              )}
            </div>
          </div>

          {/* 属性 4：授权方主体 */}
          <div className="flex items-center gap-3">
            <div className="w-24 text-[13px] text-slate-500 font-medium">授权方主体</div>
            <div className="flex-1">
              {mode === 'view' ? (
                <div className="text-[13px] text-slate-900 font-medium">{data.authorizer}</div>
              ) : (
                <input 
                  className="w-full bg-slate-50/50 px-3 py-2 rounded-lg text-[13px] text-slate-900 font-medium focus:bg-white focus:ring-1 focus:ring-slate-200 border border-transparent outline-none transition-all" 
                  value={data.authorizer} 
                  onChange={(e) => setData({ ...data, authorizer: e.target.value })} 
                />
              )}
            </div>
          </div>

          {/* 属性 5：签字盖章 */}
          <div className="flex items-start gap-3">
            <div className="w-24 text-[13px] text-slate-500 font-medium pt-2.5">签字盖章</div>
            <div className="flex-1">
              <input 
                type="file" 
                ref={fileInputRef} 
                className="hidden" 
                accept="image/*.png,image/svg+xml" 
                onChange={handleFileChange} 
              />
              <div 
                className={`flex items-center gap-3 group/seal ${mode !== 'view' ? 'cursor-pointer hover:bg-slate-50/50 p-2 -m-2 rounded-xl transition-all' : ''}`}
                onClick={() => mode !== 'view' && fileInputRef.current?.click()}
              >
                <div className="w-12 h-12 bg-slate-50 border border-slate-100 rounded-md flex items-center justify-center relative ring-offset-2 group-hover/seal:ring-1 ring-slate-200 transition-all">
                  {data.sealImage ? <img src={data.sealImage} className="w-10 h-10 object-contain" /> : <div className="text-[10px] text-slate-300">未上传</div>}
                </div>
                <div>
                  <div className="text-[11px] font-bold text-slate-900 uppercase tracking-wider">{mode === 'view' ? '备案公章' : '上传/更换公章'}</div>
                  <div className="text-[10px] text-slate-400">{mode === 'view' ? '系统自动存证' : sealFileName ? `已上传: ${sealFileName}` : '点击上传 PNG/SVG'}</div>
                </div>
              </div>
            </div>
          </div>

          {/* 属性 6：范围条款 */}
          <div className="flex items-start gap-3">
            <div className="w-24 shrink-0 text-[13px] text-slate-500 font-medium pt-2.5">授权范围条款</div>
            <div className="flex-1">
              {mode === 'view' ? (
                <div className="text-[13px] text-slate-900 leading-relaxed whitespace-pre-wrap pt-2.5">{data.scopeText}</div>
              ) : (
                <textarea 
                  rows={4} 
                  className="w-full bg-slate-50/50 px-3 py-2.5 rounded-xl text-[13px] leading-relaxed text-slate-900 font-medium focus:bg-white focus:ring-1 focus:ring-slate-200 border border-transparent outline-none transition-all resize-none h-28 overflow-y-auto" 
                  value={data.scopeText} 
                  onChange={(e) => setData({ ...data, scopeText: e.target.value })} 
                />
              )}
            </div>
          </div>
        </div>

        <div className="pt-12 pb-2 flex items-center gap-3 flex-wrap">
           {!isVoided && !isIssued && (
             <>
               <button 
                 onClick={handleDownload}
                 disabled={isDownloading}
                 className="h-11 px-4 text-slate-500 bg-white border border-slate-100 rounded-xl text-[13px] font-bold transition-all hover:bg-slate-50 flex items-center gap-2 tracking-wide disabled:opacity-50 disabled:cursor-not-allowed"
               >
                 <Download className="w-4 h-4 opacity-70" /> PNG
               </button>
               <button 
                 onClick={handleDownloadPDF}
                 disabled={isDownloading}
                 className="h-11 px-4 text-slate-500 bg-white border border-slate-100 rounded-xl text-[13px] font-bold transition-all hover:bg-slate-50 flex items-center gap-2 tracking-wide disabled:opacity-50 disabled:cursor-not-allowed"
               >
                 <File className="w-4 h-4 opacity-70" /> PDF
               </button>
             </>
           )}
           {mode !== 'view' && (
             <button 
               onClick={handleIssueSubmit}
               disabled={isSubmitting}
               className="h-11 px-8 bg-[#2C2A29] text-white rounded-xl text-[13.5px] font-bold hover:bg-black transition-all shadow-xl shadow-slate-900/10 active:scale-95 tracking-[0.1em] disabled:opacity-50 disabled:cursor-not-allowed"
             >
               {isSubmitting ? "处理中..." : "正式签发许可"}
             </button>
           )}
           {isIssued && !isVoided && (
             <>
               <button 
                 onClick={handleDownload}
                 disabled={isDownloading}
                 className="h-11 px-6 bg-blue-600 text-white rounded-xl text-[13px] font-bold hover:bg-blue-700 transition-all shadow-xl shadow-blue-100 tracking-wide flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
               >
                 <Download className="w-4 h-4" /> PNG
               </button>
               <button 
                 onClick={handleDownloadPDF}
                 disabled={isDownloading}
                 className="h-11 px-6 bg-emerald-600 text-white rounded-xl text-[13px] font-bold hover:bg-emerald-700 transition-all shadow-xl shadow-emerald-100 tracking-wide flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
               >
                 <File className="w-4 h-4" /> PDF
               </button>
             </>
           )}
        </div>
      </motion.div>

      <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} className="flex justify-center h-fit">
        <div onClick={handleImagePreview} className="w-full max-w-[460px] shadow-2xl rounded-sm bg-white overflow-hidden ring-1 ring-slate-900/5 cursor-zoom-in relative group">
          <canvas ref={canvasRef} className="w-full h-auto block" style={{ imageRendering: 'crisp-edges' }} />
          <div className="absolute inset-0 bg-slate-900/5 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white"><ZoomIn className="w-6 h-6" /></div>
        </div>
      </motion.div>

      {showFullPreview && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-900/90 backdrop-blur-md" onClick={() => setShowFullPreview(false)}>
           <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} className="relative max-w-5xl h-full flex items-center justify-center">
              <button className="absolute -top-12 right-0 text-white p-2" onClick={() => setShowFullPreview(false)}><XCircle className="w-8 h-8" /></button>
              {previewImageUrl && <img src={previewImageUrl} className="max-w-full max-h-full object-contain shadow-2xl" />}
           </motion.div>
        </div>
      )}
    </div>
  );
}

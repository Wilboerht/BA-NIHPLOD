"use client";

import React, { useRef, useState, useEffect } from "react";
import { Download, RefreshCw, FileText, CheckCircle2, XCircle, Type, Move, Printer, ChevronDown, X, ZoomIn } from "lucide-react";
import { motion } from "framer-motion";
import { supabase } from "@/lib/supabase";

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
  const [data, setData] = useState<CertData>({
    platformId: "",
    platformLabel: "淘宝ID",
    shopName: "",
    shopLabel: "店铺名称",
    scopeText: "拥有我公司代理的品牌 NIHPLOD(旎柏) 全系列产品\n在阿里巴巴集团旗下淘宝商城上的合格经销资格，\n负责该品牌产品在网站内一切相关的商务推广及售后服务。",
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
  
  const renderRequestId = useRef(0);

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
      if (!src || src.trim() === "" || src === "undefined" || src === "/default-seal.svg") return Promise.resolve(null);
      return new Promise((resolve) => {
        const img = new Image();
        img.src = src;
        img.onload = () => resolve(img);
        img.onerror = () => resolve(null);
      });
    };

    const [bgImage, sealImg] = await Promise.all([
      loadImage("/cert-template.svg"),
      data.sealImage ? loadImage(data.sealImage) : Promise.resolve(null)
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
    
    scopeLines.forEach((line) => {
      const brandKey = "NIHPLOD(旎柏)";
      if (line.includes(brandKey)) {
        const parts = line.split(brandKey);
        offCtx.font = `400 ${15 * scale}px "Noto Serif SC", serif`;
        const w1 = offCtx.measureText(parts[0]).width;
        const w3 = offCtx.measureText(parts[1]).width;
        offCtx.font = `bold ${15 * scale}px "Noto Serif SC", serif`;
        const w2 = offCtx.measureText(brandKey).width;
        
        let currentX = (width - (w1 + w2 + w3)) / 2;
        offCtx.textAlign = "left";
        offCtx.font = `400 ${15 * scale}px "Noto Serif SC", serif`;
        offCtx.fillText(parts[0], currentX, startY);
        currentX += w1;
        offCtx.font = `bold ${15 * scale}px "Noto Serif SC", serif`;
        offCtx.fillText(brandKey, currentX, startY);
        currentX += w2;
        offCtx.font = `400 ${15 * scale}px "Noto Serif SC", serif`;
        offCtx.fillText(parts[1], currentX, startY);
      } else {
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

    if (isIssued && sealImg) {
      const maxSealSize = 160 * scale;
      const aspect = sealImg.width / sealImg.height;
      const drawWidth = aspect > 1 ? maxSealSize : maxSealSize * aspect;
      const drawHeight = aspect > 1 ? maxSealSize / aspect : maxSealSize;
      
      offCtx.save();
      offCtx.translate(width - 310 * scale, 875 * scale);
      offCtx.rotate(-0.06); 
      offCtx.globalAlpha = 0.88;
      offCtx.drawImage(sealImg, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);
      offCtx.restore();
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
    link.download = `授权书_【预览稿】_${data.shopName}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  };

  const handleImagePreview = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setPreviewImageUrl(canvas.toDataURL("image/png"));
    setShowFullPreview(true);
  };

  return (
    <div className="grid lg:grid-cols-[400px_1fr] gap-12 items-start h-full pb-10">
      {/* 控制面板 */}
      <motion.div
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        className="flex flex-col h-full pl-2"
      >
        <div className="space-y-8 mt-4 mb-8">
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
                  <input type="date" className="w-[130px] bg-slate-50/50 px-2.5 py-2 rounded-lg text-[13px]" value={data.duration ? data.duration.substring(0, 10).replace(/\./g, '-') : ""} onChange={(e) => setData({ ...data, duration: `${e.target.value.replace(/-/g, '.')} - ${data.duration.split(' - ')[1] || ""}` })} />
                  <span className="text-slate-300">-</span>
                  <input type="date" className="w-[130px] bg-slate-50/50 px-2.5 py-2 rounded-lg text-[13px]" value={data.duration ? (data.duration.split(' - ')[1]?.replace(/\./g, '-') || "") : ""} onChange={(e) => setData({ ...data, duration: `${data.duration.split(' - ')[0] || ""} - ${e.target.value.replace(/-/g, '.')}` })} />
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
                <input type="text" className="w-full bg-slate-50/50 px-3 py-2 rounded-lg text-[13px]" value={data.phone} onChange={(e) => setData({ ...data, phone: e.target.value })} placeholder="请输入电话" />
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
                <input className="w-full bg-slate-50/50 px-3 py-2 rounded-lg text-[13px]" value={data.authorizer} onChange={(e) => setData({ ...data, authorizer: e.target.value })} />
              )}
            </div>
          </div>

          {/* 属性 5：签字盖章 */}
          <div className="flex items-start gap-3">
            <div className="w-24 text-[13px] text-slate-500 font-medium pt-2.5">签字盖章</div>
            <div className="flex-1 flex items-center gap-3">
              <div className="w-12 h-12 bg-slate-50 border border-slate-100 rounded-md flex items-center justify-center relative">
                {data.sealImage ? <img src={data.sealImage} className="w-10 h-10 object-contain" /> : <div className="text-[10px] text-slate-300">未上传</div>}
              </div>
              <div>
                <div className="text-[11px] font-bold text-slate-900 uppercase tracking-wider">{mode === 'view' ? '备案公章' : '上传/更换公章'}</div>
                <div className="text-[10px] text-slate-400">{mode === 'view' ? '系统自动存证' : '支持 PNG, SVG'}</div>
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
                <textarea rows={4} className="w-full bg-slate-50/50 px-3 py-2.5 rounded-xl text-[13px] leading-relaxed border border-transparent resize-none h-24 overflow-y-auto" value={data.scopeText} onChange={(e) => setData({ ...data, scopeText: e.target.value })} />
              )}
            </div>
          </div>
        </div>

        <div className="pt-6 mt-auto flex items-center gap-4 border-t border-slate-100">
           {!isVoided && <button onClick={handleDownload} className="h-9 px-4 text-slate-600 bg-white border rounded-lg text-sm font-medium transition-all hover:bg-slate-50 flex items-center gap-2"><Download className="w-4 h-4" />下载预览图片</button>}
           {mode !== 'view' && <button onClick={async () => { /* Logic */ }} className="h-9 px-6 bg-slate-900 text-white rounded-lg text-sm font-medium hover:bg-slate-800 transition-all">正式核发</button>}
           {isIssued && !isVoided && <button onClick={handleDownload} className="h-9 px-6 bg-emerald-600 text-white rounded-lg text-sm font-bold animate-bounce shadow-lg">下载正式高清授权书</button>}
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

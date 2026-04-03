"use client";

import React, { useRef, useState, useEffect } from "react";
import { Download, RefreshCw, FileText, CheckCircle2, Type, Move, Printer, ChevronDown, X, ZoomIn } from "lucide-react";
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

export default function CertificateGenerator() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scopeRef = useRef<HTMLTextAreaElement>(null);
  const platformLabelRef = useRef<HTMLInputElement>(null);
  const shopLabelRef = useRef<HTMLInputElement>(null);
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
    // 监测字体加载状态
    document.fonts.ready.then(() => {
      setIsFontLoaded(true);
    });
  }, []);


  useEffect(() => {
    renderCertificate();
  }, [data, isFontLoaded]);

  const renderCertificate = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    
    // 渲染锁：确保只绘制最后一次请求
    const currentId = ++renderRequestId.current;
    setIsGenerating(true);

    const scale = 2;
    const width = 800 * scale;
    const height = 1131 * scale;

    // --- 1. 【核心：资源前置加载】 在动主画布任何属性之前，先把异步资源准备好 ---
    const loadImage = (src: string | null | undefined): Promise<HTMLImageElement | null> => {
      if (!src || src.trim() === "" || src === "undefined" || src === "/default-seal.svg") return Promise.resolve(null);
      return new Promise((resolve) => {
        const img = new Image();
        img.src = src;
        img.onload = () => resolve(img);
        img.onerror = () => resolve(null);
      });
    };

    // 并行拉取背景和印章，此时主画布还是保留着上一帧的图像，不会闪白
    const [bgImage, sealImg] = await Promise.all([
      loadImage("/cert-template.svg"),
      data.sealImage ? loadImage(data.sealImage) : Promise.resolve(null)
    ]);

    // --- 2. 准备内存离屏画布 ---
    const offCanvas = document.createElement("canvas");
    offCanvas.width = width;
    offCanvas.height = height;
    const offCtx = offCanvas.getContext("2d");
    if (!offCtx) return;

    // --- 3. 此时开始离屏绘制 (此时主画布依然没变) ---
    // 背景图
    if (bgImage) {
      offCtx.drawImage(bgImage, 0, 0, width, height);
    } else {
      offCtx.fillStyle = "#ffffff";
      offCtx.fillRect(0, 0, width, height);
      offCtx.strokeStyle = "#eab308";
      offCtx.lineWidth = 2 * scale;
      offCtx.strokeRect(80 * scale, 80 * scale, width - 160 * scale, height - 160 * scale);
    }

    const textPrimary = "#334155";
    const textSecondary = "#475569";

    // 4. 授权主体绘制 (动态标签 + 内容)
    offCtx.textAlign = "center";
    offCtx.font = `bold ${21 * scale}px "Noto Serif SC", serif`;
    offCtx.fillStyle = "#1e293b";
    
    const idFullLine = `${data.platformLabel || "淘宝ID"}：${data.platformId || ""}`;
    const shopFullLine = `${data.shopLabel || "店铺名称"}：${data.shopName || ""}`;
    offCtx.fillText(idFullLine, width / 2, 530 * scale);
    offCtx.fillText(shopFullLine, width / 2, 578 * scale);

    // 5. 授权范围多行排版
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

    // 6. 有效期格式化与绘制
    const formatDate = (dateStr: string) => {
      if (!dateStr) return "";
      const parts = dateStr.split('.');
      return parts.length === 3 ? `${parts[0]}年${parts[1]}月${parts[2]}日` : dateStr;
    };
    const dateRange = data.duration.split(' - ');
    offCtx.textAlign = "center";
    offCtx.font = `400 ${15 * scale}px "Noto Serif SC", serif`;
    offCtx.fillText(`授权有效期：${formatDate(dateRange[0])}至${formatDate(dateRange[1])}`, width / 2, startY + 25 * scale);

    // 7. 落款与公章 (离屏合成)
    offCtx.textAlign = "left";
    offCtx.font = `500 ${14 * scale}px "Noto Serif SC", serif`;
    offCtx.fillText(`授权方：${data.authorizer || ""}`, width - 435 * scale, 848 * scale);
    offCtx.fillText("签字/盖章：", width - 435 * scale, 892 * scale);

    if (sealImg) {
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


    // 9. 全幅平铺水印叠印 (离屏)
    offCtx.save();
    offCtx.rotate(-Math.PI / 4); // 旋转全场坐标
    offCtx.textAlign = "center";
    offCtx.font = `bold ${18 * scale}px "Noto Serif SC", serif`;
    offCtx.fillStyle = "rgba(100, 116, 139, 0.15)"; // 加深至 15% 不透明度，更显眼
    
    // 平铺范围需要覆盖旋转后的对角线长度
    const stepX = 220 * scale;
    const stepY = 160 * scale;
    for (let x = -width; x < width * 2; x += stepX) {
      for (let y = -height; y < height * 2; y += stepY) {
        offCtx.fillText("非生效授权凭证", x, y);
      }
    }
    offCtx.restore();

    // --- 完工投射：原子级更新，杜绝闪烁 ---
    if (currentId === renderRequestId.current) {
        // 关键：只有在尺寸不符时才动 width，防止强制清空
        if (canvas.width !== width || canvas.height !== height) {
            canvas.width = width;
            canvas.height = height;
        }
        ctx.clearRect(0, 0, width, height); // 此时清空并在下一行立即填充，肉眼无法察觉
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
    <div className="grid lg:grid-cols-[380px_1fr] gap-12 items-start h-full pb-10">
      {/* 控制面板：极简属性检查器 */}
      <motion.div
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        className="flex flex-col h-full"
      >
        <div className="space-y-8 mt-2 mb-8">
          {/* 属性 1：平台ID/标题 */}
          <div className="flex items-center gap-3 group">
            <div className="w-24 relative -ml-2 group/label">
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
                  <motion.div 
                    initial={{ opacity: 0, y: 4, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    className="absolute left-0 mt-1 w-48 bg-white rounded-xl shadow-xl border border-slate-100 overflow-hidden z-20"
                  >
                    <div className="px-3 py-2 bg-slate-50/80 border-b border-slate-100">
                      <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1">自定义输入</div>
                      <input
                        autoFocus
                        className="w-full text-[12px] text-slate-700 font-medium outline-none placeholder:text-slate-300 bg-transparent"
                        placeholder="输入新名称..."
                        value={data.platformLabel}
                        onChange={(e) => setData({ ...data, platformLabel: e.target.value })}
                        onClick={(e) => e.stopPropagation()}
                      />
                    </div>
                    <div className="py-1.5">
                      <div className="px-3 py-1 text-[10px] text-slate-400 font-bold uppercase tracking-wider">常用预设</div>
                      {platformOptions.map(opt => (
                        <button
                          key={opt}
                          className={`w-full px-3 py-2 text-left text-[13px] transition-colors ${data.platformLabel === opt ? 'text-blue-600 bg-blue-50/50 font-medium' : 'text-slate-600 hover:bg-slate-50'}`}
                          onClick={() => {
                            setData({ ...data, platformLabel: opt });
                            setActiveDropdown(null);
                          }}
                        >
                          {opt}
                        </button>
                      ))}
                    </div>
                  </motion.div>
                </>
              )}
            </div>
            <div className="flex-1">
              <input
                type="text"
                placeholder="请输入对应的平台 ID 或账号"
                className="w-full bg-transparent hover:bg-slate-50 px-3 py-2 rounded-lg text-[13px] text-slate-900 font-medium focus:bg-white focus:ring-1 focus:ring-slate-200 border border-transparent outline-none transition-all placeholder:text-slate-400"
                value={data.platformId}
                onChange={(e) => setData({ ...data, platformId: e.target.value })}
              />
            </div>
          </div>

          {/* 属性 2：店铺名称/标题 */}
          <div className="flex items-center gap-3 group">
            <div className="w-24 relative -ml-2 group/label">
              <div 
                className="flex items-center gap-1.5 hover:bg-slate-50 px-2 py-1.5 rounded-lg transition-colors cursor-pointer"
                onClick={() => setActiveDropdown(activeDropdown === 'shop' ? null : 'shop')}
              >
                <span className="text-[13px] text-slate-500 font-medium truncate flex-1">
                  {data.shopLabel || "名称"}
                </span>
                <ChevronDown className={`w-3.5 h-3.5 text-slate-300 transition-transform duration-200 ${activeDropdown === 'shop' ? 'rotate-180 text-blue-500' : 'group-hover/label:text-slate-400'}`} />
              </div>
              
              {activeDropdown === 'shop' && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setActiveDropdown(null)} />
                  <motion.div 
                    initial={{ opacity: 0, y: 4, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    className="absolute left-0 mt-1 w-48 bg-white rounded-xl shadow-xl border border-slate-100 overflow-hidden z-20"
                  >
                    <div className="px-3 py-2 bg-slate-50/80 border-b border-slate-100">
                      <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1">自定义输入</div>
                      <input
                        autoFocus
                        className="w-full text-[12px] text-slate-700 font-medium outline-none placeholder:text-slate-300 bg-transparent"
                        placeholder="输入新名称..."
                        value={data.shopLabel}
                        onChange={(e) => setData({ ...data, shopLabel: e.target.value })}
                        onClick={(e) => e.stopPropagation()}
                      />
                    </div>
                    <div className="py-1.5">
                      <div className="px-3 py-1 text-[10px] text-slate-400 font-bold uppercase tracking-wider">常用预设</div>
                      {shopOptions.map(opt => (
                        <button
                          key={opt}
                          className={`w-full px-3 py-2 text-left text-[13px] transition-colors ${data.shopLabel === opt ? 'text-blue-600 bg-blue-50/50 font-medium' : 'text-slate-600 hover:bg-slate-50'}`}
                          onClick={() => {
                            setData({ ...data, shopLabel: opt });
                            setActiveDropdown(null);
                          }}
                        >
                          {opt}
                        </button>
                      ))}
                    </div>
                  </motion.div>
                </>
              )}
            </div>
            <div className="flex-1">
              <input
                type="text"
                placeholder="请输入被授权的主体名称"
                maxLength={50}
                className="w-full bg-transparent hover:bg-slate-50 px-3 py-2 rounded-lg text-[13px] text-slate-900 font-medium focus:bg-white focus:ring-1 focus:ring-slate-200 border border-transparent outline-none transition-all placeholder:text-slate-400"
                value={data.shopName}
                onChange={(e) => setData({ ...data, shopName: e.target.value })}
              />
            </div>
          </div>


          {/* 属性 3：有效期 */}
          <div className="flex items-center gap-3 group">
            <div className="w-24 text-[13px] text-slate-500 font-medium">
              有效期
            </div>
            <div className="flex-1 flex items-center gap-2">
              <input
                type="date"
                className="flex-[0.5] min-w-0 bg-transparent hover:bg-slate-50 px-3 py-2 rounded-lg text-[13px] text-slate-900 font-medium focus:bg-white focus:ring-1 focus:ring-slate-200 border border-transparent hover:border-slate-100 outline-none transition-all cursor-pointer text-center"
                value={data.duration ? data.duration.substring(0, 10).replace(/\./g, '-') : ""}
                onChange={(e) => {
                  const newStart = e.target.value.replace(/-/g, '.');
                  const currentEnd = data.duration.split(' - ')[1] || "";
                  setData({ ...data, duration: `${newStart} - ${currentEnd}` });
                }}
              />
              <span className="text-slate-300">-</span>
              <input
                type="date"
                className="flex-[0.5] min-w-0 bg-transparent hover:bg-slate-50 px-3 py-2 rounded-lg text-[13px] text-slate-900 font-medium focus:bg-white focus:ring-1 focus:ring-slate-200 border border-transparent hover:border-slate-100 outline-none transition-all cursor-pointer text-center"
                value={data.duration ? (data.duration.split(' - ')[1]?.replace(/\./g, '-') || "") : ""}
                onChange={(e) => {
                  const currentStart = data.duration.split(' - ')[0] || "";
                  const newEnd = e.target.value.replace(/-/g, '.');
                  setData({ ...data, duration: `${currentStart} - ${newEnd}` });
                }}
              />
            </div>
          </div>

          {/* 属性：联系电话 */}
          <div className="flex items-center gap-3 group">
            <div className="w-24 text-[13px] text-slate-500 font-medium">
              联系电话
            </div>
            <div className="flex-1">
              <input
                type="text"
                maxLength={11}
                className="w-full bg-transparent hover:bg-slate-50 px-3 py-2 rounded-lg text-[13px] text-slate-900 font-medium focus:bg-white focus:ring-1 focus:ring-slate-200 border border-transparent hover:border-slate-100 outline-none transition-all tabular-nums"
                value={data.phone}
                onChange={(e) => {
                    const val = e.target.value.replace(/[^\d]/g, '');
                    if (val.length <= 11) {
                        setData({ ...data, phone: val });
                    }
                }}
                placeholder="请输入11位联系电话"
              />
            </div>
          </div>

          {/* 属性 4：授权方主体 */}
          <div className="flex items-center gap-3 group">
            <div className="w-24 text-[13px] text-slate-500 font-medium">
              授权方主体
            </div>
            <div className="flex-1">
              <input
                className="w-full bg-transparent hover:bg-slate-50 px-3 py-2 rounded-lg text-[13px] text-slate-900 font-medium focus:bg-white focus:ring-1 focus:ring-slate-200 border border-transparent hover:border-slate-100 outline-none transition-all"
                value={data.authorizer}
                onChange={(e) => setData({ ...data, authorizer: e.target.value })}
                placeholder="例如：MOIDAS LTD. / 穆埃达思有限公司"
              />
            </div>
          </div>

          {/* 属性 5：印章配置 */}
          <div className="flex items-start gap-3 group">
            <div className="w-24 text-[13px] text-slate-500 font-medium pt-2.5">
              签字盖章
            </div>
            <div className="flex-1 flex items-center gap-4">
              <div className="w-12 h-12 bg-slate-50 border border-slate-100 rounded-md flex items-center justify-center overflow-hidden relative group/seal">
                {data.sealImage ? (
                  <img
                    src={data.sealImage}
                    alt="Seal Preview"
                    className="w-10 h-10 object-contain opacity-80"
                  />
                ) : (
                  <div className="text-slate-300 text-[10px]">未上传</div>
                )}
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-bold text-slate-900 hover:text-primary transition-colors cursor-pointer uppercase tracking-wider">
                  上传/更换公章
                  <input
                    type="file"
                    className="hidden"
                    accept="image/png,image/jpeg,image/svg+xml"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        const reader = new FileReader();
                        reader.onload = (ev) => {
                          setData({ ...data, sealImage: ev.target?.result as string });
                        };
                        reader.readAsDataURL(file);
                      }
                    }}
                  />
                </label>
                <div className="text-[10px] text-slate-400">支持 PNG, SVG (透明底最佳)</div>
              </div>
            </div>
          </div>

          {/* 属性 6：授权范围区块 */}
          <div className="flex items-start group">
            <div className="w-24 shrink-0 text-[13px] text-slate-500 font-medium pt-2.5">
              授权范围条款
            </div>
            <div className="flex-1">
              <textarea
              ref={scopeRef}
              rows={1}
            className="w-full bg-slate-50/50 hover:bg-slate-100/50 px-3 py-2.5 rounded-xl text-[13px] text-slate-900 leading-relaxed focus:bg-white focus:ring-1 focus:ring-slate-200 border border-transparent outline-none transition-all resize-none h-24 overflow-y-auto [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-slate-200 [&::-webkit-scrollbar-thumb]:rounded-full hover:[&::-webkit-scrollbar-thumb]:bg-slate-300"
              value={data.scopeText}
              onChange={(e) => setData({ ...data, scopeText: e.target.value })}
              placeholder="请输入授权范围条款"
            /></div>
          </div>
        </div>

        <div className="pt-6 mt-auto flex items-center justify-start gap-4 border-t border-slate-100">
          <button
            onClick={handleDownload}
            className="h-9 px-4 text-slate-600 bg-white border border-slate-200 hover:border-slate-300 hover:bg-slate-50 font-medium flex items-center gap-2 transition-all text-sm rounded-lg shadow-sm active:scale-[0.98]"
          >
            <Download className="w-4 h-4 text-slate-400" />
            下载预览图片
          </button>

          <button
            onClick={async () => {
              if (!data.shopName || !data.platformId || !data.phone || data.phone.length !== 11) {
                alert("⚠️ 请完整填写店铺名称、主体ID及正确的11位联系电话！");
                return;
              }

              setIsSubmitting(true);
              try {
                const { data: { session } } = await supabase.auth.getSession();
                if (!session) {
                    alert("请先登录系统");
                    return;
                }

                const actionType = (userRole === 'SUPER_ADMIN' || userRole === 'PROJECT_MANAGER' || userRole === 'MANAGER') 
                    ? 'approve_issue'
                    : 'create_pending';
                
                const response = await fetch('/api/certificates', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                        action: actionType,
                        certData: data, 
                        managerId: session?.user?.id 
                    })
                });

                const result = await response.json();
                
                if (!response.ok) throw new Error(result.error || "操作请求失败");

                if (actionType === 'approve_issue') {
                    alert(`✅ 证书已直接核发！\n\n已为经销商开通系统账户：\n账户：${result.email}\n密码：${result.password}`);
                } else {
                    alert(`📩 提报审核成功！\n请等待项目负责人审核通过并核发。`);
                }
              } catch (err: any) {
                console.error(err);
                alert("操作失败: " + (err.message || "未知错误"));
              } finally {
                setIsSubmitting(false);
              }
            }}
            disabled={isSubmitting || isGenerating}
            className={`h-9 px-6 font-medium rounded-lg flex items-center justify-center gap-2 transition-all shadow-md active:scale-[0.98] text-sm ${
              (isSubmitting || isGenerating) 
                ? 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none' 
                : 'bg-slate-900 text-white hover:bg-slate-800 hover:shadow-lg'
            }`}
          >
            {isSubmitting ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                正在签发中...
              </>
            ) : (
                (userRole === 'SUPER_ADMIN' || userRole === 'PROJECT_MANAGER' || userRole === 'MANAGER') ? '核发授权书' : '提报审核'
            )}
          </button>
        </div>
      </motion.div>

      {/* 预览区域：去除一切杂乱边框 */}
      <motion.div
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        className="flex justify-center"
      >
        <div 
          onClick={handleImagePreview}
          className="w-full max-w-[460px] shadow-[0_20px_60px_-15px_rgba(0,0,0,0.1)] rounded-sm bg-white overflow-hidden ring-1 ring-slate-900/5 cursor-zoom-in group/preview relative"
        >
          <canvas
            ref={canvasRef}
            className="w-full h-auto block transition-transform duration-500 group-hover/preview:scale-[1.01]"
            style={{ imageRendering: 'crisp-edges' }}
          />
          <div className="absolute inset-0 bg-slate-900/0 group-hover/preview:bg-slate-900/5 transition-colors flex items-center justify-center opacity-0 group-hover/preview:opacity-100 duration-300">
             <div className="bg-white/90 backdrop-blur-sm p-3 rounded-full shadow-xl transform translate-y-4 group-hover/preview:translate-y-0 transition-transform">
                <ZoomIn className="w-5 h-5 text-slate-900" />
             </div>
          </div>
        </div>
      </motion.div>

      {/* 全屏放大预览模态框 */}
      {showFullPreview && (
        <div 
          className="fixed inset-0 z-[120] flex items-center justify-center p-4 md:p-12 bg-slate-900/90 backdrop-blur-md"
          onClick={() => setShowFullPreview(false)}
        >
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="relative max-w-5xl w-full h-full flex items-center justify-center"
            onClick={e => e.stopPropagation()}
          >
             <button 
               onClick={() => setShowFullPreview(false)}
               className="absolute -top-12 right-0 md:-right-12 text-white hover:text-slate-300 transition-colors p-2"
             >
                <X className="w-8 h-8" />
             </button>
             <img 
               src={previewImageUrl} 
               alt="授权书高清预览" 
               className="max-w-full max-h-full object-contain shadow-2xl rounded-sm" 
             />
          </motion.div>
        </div>
      )}
    </div>
  );
}

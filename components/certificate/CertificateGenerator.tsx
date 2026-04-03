"use client";

import React, { useRef, useState, useEffect } from "react";
import { Download, RefreshCw, FileText, CheckCircle2, Type, Move, Printer } from "lucide-react";
import { motion } from "framer-motion";
import { supabase } from "@/lib/supabase";

interface CertData {
  platformId: string;
  shopName: string;
  scopeText: string;
  duration: string;
  authorizer: string;
  sealImage: string; // URL or DataURL
}

import QRCode from "qrcode";

export default function CertificateGenerator() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [data, setData] = useState<CertData>({
    platformId: "",
    shopName: "",
    scopeText: "拥有我公司代理的品牌 NIHPLOD(旎柏) 全系列产品\n在阿里巴巴集团旗下淘宝商城上的合格经销资格，\n负责该品牌产品在网站内一切相关的商务推广及售后服务。",
    duration: `${new Date().getFullYear()}.${String(new Date().getMonth() + 1).padStart(2, '0')}.${String(new Date().getDate()).padStart(2, '0')} - ${new Date().getFullYear() + 1}.${String(new Date().getMonth() + 1).padStart(2, '0')}.${String(new Date().getDate()).padStart(2, '0')}`,
    authorizer: "旎柏（上海）商贸有限公司",
    sealImage: "/default-seal.svg",
  });

  const [isGenerating, setIsGenerating] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [data.scopeText]);

  const renderCertificate = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    setIsGenerating(true);

    const scale = 2;
    const width = 800 * scale;
    const height = 1131 * scale;
    canvas.width = width;
    canvas.height = height;

    // 1. 底色与模板加载
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);

    // 加载提供的 SVG 模板作为底层背景
    try {
      const bgImage = new Image();
      bgImage.src = "/cert-template.svg";
      await new Promise((resolve) => {
        bgImage.onload = () => {
          ctx.drawImage(bgImage, 0, 0, width, height);
          resolve(true);
        };
        bgImage.onerror = () => {
          // Fallback if background fails
          ctx.strokeStyle = "#eab308";
          ctx.lineWidth = 2 * scale;
          ctx.strokeRect(80 * scale, 80 * scale, width - 160 * scale, height - 160 * scale);
          resolve(false);
        };
      });
    } catch (e) {
      console.error("Template loading failed", e);
    }

    const textPrimary = "#334155";
    const textSecondary = "#475569";

    // --- 只绘制可编辑的动态内容 ---

    // 3. 授权主体 (淘宝ID & 店铺名称)
    ctx.textAlign = "center";
    ctx.font = `bold ${21 * scale}px "Noto Serif SC", serif`;
    ctx.fillStyle = "#1e293b";

    // 把“标签 + 内容”合并成一个完整字符串，直接在 width / 2 处居中显示
    const idFullLine = `淘宝ID：${data.platformId || ""}`;
    const shopFullLine = `店铺名称：${data.shopName || ""}`;

    // Y 轴垂直坐标：再次精准微调，压缩行间距，追求极致的视觉凝聚力
    ctx.fillText(idFullLine, width / 2, 530 * scale);
    ctx.fillText(shopFullLine, width / 2, 578 * scale);

    // 4. 授权范围 (多行文本 + 品牌加粗逻辑)
    ctx.font = `400 ${15 * scale}px "Noto Serif SC", serif`;
    ctx.fillStyle = textPrimary;
    const scopeLines = (data.scopeText || "").split('\n');
    let startY = 630 * scale; 
    
    scopeLines.forEach((line) => {
      // 检查当前行是否包含品牌词，如果包含则分段渲染以实现局部加粗
      const brandKey = "NIHPLOD(旎柏)";
      if (line.includes(brandKey)) {
        const parts = line.split(brandKey);
        
        // 准确测算整行（包含加粗部分）的总宽度，确保真正的居中
        ctx.font = `400 ${15 * scale}px "Noto Serif SC", serif`;
        const w1 = ctx.measureText(parts[0]).width;
        const w3 = ctx.measureText(parts[1]).width;
        ctx.font = `bold ${15 * scale}px "Noto Serif SC", serif`;
        const w2 = ctx.measureText(brandKey).width;
        
        const totalLineWeight = w1 + w2 + w3;
        let currentX = (width - totalLineWeight) / 2;
        
        ctx.textAlign = "left";
        // 绘制前半部分
        ctx.font = `400 ${15 * scale}px "Noto Serif SC", serif`;
        ctx.fillText(parts[0], currentX, startY);
        currentX += w1;
        
        // 绘制加粗品牌名 (严格保持 15px 字号，仅改变字重)
        ctx.font = `bold ${15 * scale}px "Noto Serif SC", serif`;
        ctx.fillText(brandKey, currentX, startY);
        currentX += w2;
        
        // 绘制后半部分
        ctx.font = `400 ${15 * scale}px "Noto Serif SC", serif`;
        ctx.fillText(parts[1], currentX, startY);
      } else {
        ctx.textAlign = "center";
        ctx.font = `400 ${15 * scale}px "Noto Serif SC", serif`;
        ctx.fillText(line.trim(), width / 2, startY);
      }
      startY += 30 * scale;
    });

    // 5. 有效期 (转换日期格式为：YYYY年MM月DD日)
    const formatDate = (dateStr: string) => {
      if (!dateStr) return "";
      const parts = dateStr.split('.');
      if (parts.length !== 3) return dateStr;
      return `${parts[0]}年${parts[1]}月${parts[2]}日`;
    };

    const dateRange = data.duration.split(' - ');
    const startText = formatDate(dateRange[0]);
    const endText = formatDate(dateRange[1]);
    const finalDateLine = `授权有效期：${startText}至${endText}`;

    ctx.fillText(finalDateLine, width / 2, startY + 25 * scale);

    // 6. 落款授权方 (整行复刻，重合覆盖底图原有的抬头)
    ctx.textAlign = "left";
    ctx.font = `500 ${14 * scale}px "Noto Serif SC", serif`;
    const authorizerFullLine = `授权方：${data.authorizer || ""}`;
    ctx.fillText(authorizerFullLine, width - 405 * scale, 848 * scale);
    
    // 6.1 签字/盖章 (重合覆盖底图)
    ctx.fillText("签字/盖章：", width - 405 * scale, 892 * scale);

    // 6.5 绘制电子公章/签名图片
    if (data.sealImage) {
      try {
        const sealImg = new Image();
        sealImg.src = data.sealImage;
        await new Promise((resolve) => {
          sealImg.onload = () => {
            ctx.save();
            ctx.translate(width - 210 * scale, height - 165 * scale);
            ctx.rotate(-0.06);
            ctx.globalAlpha = 0.88;
            ctx.drawImage(sealImg, -65 * scale, -65 * scale, 130 * scale, 130 * scale);
            ctx.restore();
            resolve(true);
          };
          sealImg.onerror = () => resolve(false);
        });
      } catch (e) {
        console.error("Seal loading failed", e);
      }
    }

    /* 临时移除二维码渲染
    try {
      const verifyUrl = `https://ba.nihplod.cn/verify?shop=${encodeURIComponent(data.shopName)}`;
      const qrDataUrl = await QRCode.toDataURL(verifyUrl, { margin: 1, width: 80 * scale });
      
      const qrImage = new Image();
      qrImage.src = qrDataUrl;
      await new Promise((resolve) => {
        qrImage.onload = () => {
          ctx.drawImage(qrImage, 120 * scale, height - 200 * scale, 75 * scale, 75 * scale);
          resolve(true);
        };
      });
      ctx.textAlign = "center";
      ctx.fillStyle = "#94a3b8";
      ctx.font = `${10 * scale}px sans-serif`;
      ctx.fillText("扫码核验真伪", 157 * scale, height - 110 * scale);
    } catch(err) {
      console.error(err);
    }
    */

    setIsGenerating(false);
  };

  useEffect(() => {
    renderCertificate();
  }, [data]);

  const handleDownload = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const link = document.createElement("a");
    link.download = `授权书_${data.shopName}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
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
          {/* 属性 1：平台ID */}
          <div className="flex items-center group">
            <div className="w-[100px] shrink-0 text-[13px] text-slate-500 font-medium">
              平台账号
            </div>
            <div className="flex-1">
              <input
                className="w-full bg-transparent hover:bg-slate-50 px-3 py-2 rounded-lg text-[13px] text-slate-900 font-medium focus:bg-white focus:ring-1 focus:ring-slate-200 border border-transparent hover:border-slate-100 outline-none transition-all"
                value={data.platformId}
                onChange={(e) => setData({ ...data, platformId: e.target.value })}
                placeholder="例如：八百头猪竟然"
              />
            </div>
          </div>

          {/* 属性 2：店铺名称 */}
          <div className="flex items-center group">
            <div className="w-[100px] shrink-0 text-[13px] text-slate-500 font-medium">
              店铺名称
            </div>
            <div className="flex-1">
              <input
                className="w-full bg-transparent hover:bg-slate-50 px-3 py-2 rounded-lg text-[13px] text-slate-900 font-medium focus:bg-white focus:ring-1 focus:ring-slate-200 border border-transparent hover:border-slate-100 outline-none transition-all"
                value={data.shopName}
                onChange={(e) => setData({ ...data, shopName: e.target.value })}
                placeholder="例如：草莓小象 院线护肤"
              />
            </div>
          </div>

          {/* 属性 3：有效期 */}
          <div className="flex items-center group">
            <div className="w-[100px] shrink-0 text-[13px] text-slate-500 font-medium">
              有效期
            </div>
            <div className="flex-1 flex items-center gap-2">
              <input
                type="date"
                className="flex-[0.5] min-w-0 bg-transparent hover:bg-slate-50 px-3 py-2 rounded-lg text-[13px] text-slate-900 font-medium focus:bg-white focus:ring-1 focus:ring-slate-200 border border-transparent hover:border-slate-100 outline-none transition-all cursor-pointer"
                value={data.duration ? data.duration.substring(0, 10).replace(/\./g, '-') : ""}
                onChange={(e) => {
                  const newStart = e.target.value.replace(/-/g, '.');
                  const currentEnd = data.duration.split(' - ')[1] || "";
                  setData({ ...data, duration: `${newStart} - ${currentEnd}` });
                }}
              />
              <span className="text-slate-300 font-medium text-[11px]">-</span>
              <input
                type="date"
                className="flex-[0.5] min-w-0 bg-transparent hover:bg-slate-50 px-3 py-2 rounded-lg text-[13px] text-slate-900 font-medium focus:bg-white focus:ring-1 focus:ring-slate-200 border border-transparent hover:border-slate-100 outline-none transition-all cursor-pointer"
                value={data.duration ? (data.duration.split(' - ')[1]?.replace(/\./g, '-') || "") : ""}
                onChange={(e) => {
                  const currentStart = data.duration.split(' - ')[0] || "";
                  const newEnd = e.target.value.replace(/-/g, '.');
                  setData({ ...data, duration: `${currentStart} - ${newEnd}` });
                }}
              />
            </div>
          </div>

          {/* 属性 4：授权方主体 */}
          <div className="flex items-center group">
            <div className="w-[100px] shrink-0 text-[13px] text-slate-500 font-medium">
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
          <div className="flex items-center group">
            <div className="w-[100px] shrink-0 text-[13px] text-slate-500 font-medium">
              签字盖章
            </div>
            <div className="flex-1 flex items-center gap-4">
              <div className="w-12 h-12 bg-slate-50 border border-slate-100 rounded-md flex items-center justify-center overflow-hidden relative group/seal">
                <img
                  src={data.sealImage}
                  alt="Seal Preview"
                  className="w-10 h-10 object-contain opacity-80"
                  onError={(e) => {
                    // Fallback to a placeholder icon if image fails
                    (e.target as HTMLImageElement).src = "https://img.icons8.com/ios-filled/50/94a3b8/stamp.png";
                  }}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-bold text-slate-900 hover:text-primary transition-colors cursor-pointer uppercase tracking-wider">
                  更换印章图片
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
              {data.sealImage !== "/default-seal.svg" && (
                <button
                  onClick={() => setData({ ...data, sealImage: "/default-seal.svg" })}
                  className="ml-auto text-[10px] text-slate-400 hover:text-red-500 transition-colors"
                >
                  恢复默认
                </button>
              )}
            </div>
          </div>

          {/* 属性 6：授权范围区块 */}
          <div className="flex items-start group">
            <div className="w-[100px] shrink-0 text-[13px] text-slate-500 font-medium pt-2.5">
              授权范围条款
            </div>
            <div className="flex-1">
              <textarea
                ref={textareaRef}
                className="w-full bg-transparent hover:bg-slate-50 px-3 py-2.5 rounded-lg text-[13px] text-slate-900 font-medium focus:bg-white focus:ring-1 focus:ring-slate-200 border border-transparent hover:border-slate-100 outline-none transition-all resize-none leading-relaxed overflow-hidden"
                value={data.scopeText}
                onChange={(e) => setData({ ...data, scopeText: e.target.value })}
              />
            </div>
          </div>
        </div>

        <div className="pt-6 mt-auto flex items-center justify-end gap-3 border-t border-slate-100">
          <button
            onClick={handleDownload}
            className="h-9 px-4 text-slate-600 bg-white border border-slate-200 hover:border-slate-300 hover:bg-slate-50 font-medium flex items-center gap-2 transition-all text-sm rounded-lg shadow-sm active:scale-[0.98]"
          >
            <Download className="w-4 h-4 text-slate-400" />
            下载图片
          </button>

          <button
            onClick={async () => {
              if (!data.shopName || !data.scopeText || !data.platformId) {
                alert("⚠️ 请完整填写带【待填写】标记的核心授权信息才能生成唯一凭证！");
                return;
              }

              setIsGenerating(true);
              try {
                const { data: { session } } = await supabase.auth.getSession();
                let dealerId;
                const { data: dealers } = await supabase.from('dealers').select('id').eq('company_name', data.shopName);
                if (dealers && dealers.length > 0) {
                  dealerId = dealers[0].id;
                } else {
                  const { data: newDealer, error: dealerErr } = await supabase.from('dealers').insert({ company_name: data.shopName }).select('id').single();
                  if (dealerErr) throw dealerErr;
                  dealerId = newDealer.id;
                }
                const startDate = new Date(data.duration.split(' - ')[0].replace(/\./g, '-'));
                const endDate = new Date(data.duration.split(' - ')[1].replace(/\./g, '-'));
                const { error: certErr } = await supabase.from('certificates').insert({
                  cert_number: `BAVP-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}-${Math.floor(Math.random() * 1000)}`,
                  dealer_id: dealerId,
                  auth_scope: data.platformId + ' | ' + data.scopeText.substring(0, 50),
                  start_date: startDate.toISOString().split('T')[0],
                  end_date: endDate.toISOString().split('T')[0],
                  status: 'ISSUED',
                  manager_id: session?.user?.id
                });
                if (certErr) throw certErr;
                alert("✅ 证书已成功签发并落库。");
              } catch (err: any) {
                console.error(err);
                alert("登记失败: " + (err.message || "未知错误"));
              } finally {
                setIsGenerating(false);
              }
            }}
            className="h-9 px-6 bg-slate-900 text-white font-medium rounded-lg flex items-center justify-center gap-2 hover:bg-slate-800 hover:shadow-lg transition-all shadow-md active:scale-[0.98] text-sm"
          >
            核发授权书
          </button>
        </div>
      </motion.div>

      {/* 预览区域：去除一切杂乱边框 */}
      <motion.div
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        className="flex justify-center"
      >
        <div className="w-full max-w-[460px] shadow-[0_20px_60px_-15px_rgba(0,0,0,0.1)] rounded-sm bg-white overflow-hidden ring-1 ring-slate-900/5">
          <canvas
            ref={canvasRef}
            className="w-full h-auto block"
            style={{ imageRendering: 'crisp-edges' }}
          />
        </div>
      </motion.div>
    </div>
  );
}

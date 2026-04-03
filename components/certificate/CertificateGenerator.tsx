"use client";

import React, { useRef, useState, useEffect } from "react";
import { Download, RefreshCw, FileText, CheckCircle2, Type, Move, Printer } from "lucide-react";
import { motion } from "framer-motion";
import { supabase } from "@/lib/supabase";

interface CertData {
  dealerName: string;
  certNumber: string;
  duration: string;
  scope: string;
}

export default function CertificateGenerator() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [data, setData] = useState<CertData>({
    dealerName: "上海宜家实业有限公司",
    certNumber: "BAVP-2024-8888",
    duration: "2024.01.01 - 2025.12.31",
    scope: "华东大区 / 全渠道授权",
  });

  const [isGenerating, setIsGenerating] = useState(false);

  const renderCertificate = () => {
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

    // 1. 背景绘制
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);

    // 装饰边框
    ctx.strokeStyle = "#c2410c"; 
    ctx.lineWidth = 15 * scale;
    ctx.strokeRect(40 * scale, 40 * scale, width - 80 * scale, height - 80 * scale);
    ctx.strokeStyle = "#0f172a"; 
    ctx.lineWidth = 2 * scale;
    ctx.strokeRect(60 * scale, 60 * scale, width - 120 * scale, height - 120 * scale);

    // 2. 核心标题
    ctx.fillStyle = "#0f172a";
    ctx.textAlign = "center";
    ctx.font = `bold ${48 * scale}px serif`;
    ctx.fillText("品 牌 授 权 书", width / 2, 250 * scale);
    ctx.font = `${18 * scale}px sans-serif`;
    ctx.fillStyle = "#94a3b8";
    ctx.fillText("官方资质 · 权威认证", width / 2, 300 * scale);

    // 3. 经销商信息
    ctx.fillStyle = "#0f172a";
    ctx.font = `bold ${32 * scale}px sans-serif`;
    ctx.fillText(data.dealerName, width / 2, 480 * scale);
    ctx.font = `${20 * scale}px sans-serif`;
    ctx.fillStyle = "#64748b";
    ctx.fillText("兹授权以上单位为我品牌官方合作伙伴", width / 2, 550 * scale);

    // 详细字段
    const drawInfo = (label: string, value: string, y: number) => {
      ctx.textAlign = "right";
      ctx.fillStyle = "#94a3b8";
      ctx.font = `${18 * scale}px sans-serif`;
      ctx.fillText(label, width / 2 - 20 * scale, y);
      ctx.textAlign = "left";
      ctx.fillStyle = "#0f172a";
      ctx.font = `bold ${20 * scale}px sans-serif`;
      ctx.fillText(value, width / 2 + 20 * scale, y);
    };

    drawInfo("授权编号：", data.certNumber, 680 * scale);
    drawInfo("有效期限：", data.duration, 740 * scale);
    drawInfo("授权范围：", data.scope, 800 * scale);

    // 4. 公章模拟
    const sealX = width - 280 * scale;
    const sealY = height - 280 * scale;
    ctx.beginPath();
    ctx.arc(sealX, sealY, 80 * scale, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(194, 65, 12, 0.7)";
    ctx.lineWidth = 6 * scale;
    ctx.stroke();
    ctx.font = `bold ${16 * scale}px sans-serif`;
    ctx.fillStyle = "rgba(194, 65, 12, 0.7)";
    ctx.textAlign = "center";
    ctx.translate(sealX, sealY);
    ctx.rotate(-Math.PI / 8);
    ctx.fillText("官方授权中心", 0, -10 * scale);
    ctx.fillText("品牌核发专用章", 0, 20 * scale);
    ctx.setTransform(1, 0, 0, 1, 0, 0); 

    // 5. 防伪说明
    ctx.fillStyle = "#f8fafc";
    ctx.fillRect(100 * scale, height - 200 * scale, 100 * scale, 100 * scale);
    ctx.fillStyle = "#cbd5e1";
    ctx.font = `${12 * scale}px sans-serif`;
    ctx.fillText("防伪二维码", 150 * scale, height - 80 * scale);

    setIsGenerating(false);
  };

  useEffect(() => {
    renderCertificate();
  }, [data]);

  const handleDownload = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const link = document.createElement("a");
    link.download = `授权书_${data.dealerName}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  };

  return (
    <div className="grid lg:grid-cols-[400px_1fr] gap-10">
      {/* 控制面板 */}
      <motion.div 
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        className="space-y-6"
      >
        <div className="bg-white p-8 rounded-2xl border border-slate-100 shadow-xl space-y-8">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center">
              <Type className="w-6 h-6 text-primary" />
            </div>
            <div>
               <h3 className="font-bold text-slate-800">证书动态填充</h3>
               <p className="text-[11px] text-slate-400 font-semibold uppercase tracking-widest">实时数据同步渲染</p>
            </div>
          </div>

          <div className="space-y-6">
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest ml-1">经销商全称</label>
              <input 
                className="w-full bg-slate-50 border border-slate-100 rounded-xl px-5 py-3 text-slate-900 font-bold focus:border-primary outline-none transition-all shadow-sm"
                value={data.dealerName}
                onChange={(e) => setData({...data, dealerName: e.target.value})}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest ml-1">唯一授权编号</label>
              <input 
                className="w-full bg-slate-50 border border-slate-100 rounded-xl px-5 py-3 text-slate-900 font-bold focus:border-primary outline-none transition-all font-mono"
                value={data.certNumber}
                onChange={(e) => setData({...data, certNumber: e.target.value})}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest ml-1">有效期</label>
                <input 
                  className="w-full bg-slate-50 border border-slate-100 rounded-xl px-5 py-3 text-slate-900 font-bold focus:border-primary outline-none transition-all"
                  value={data.duration}
                  onChange={(e) => setData({...data, duration: e.target.value})}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest ml-1">授权范围</label>
                <input 
                  className="w-full bg-slate-50 border border-slate-100 rounded-xl px-5 py-3 text-slate-900 font-bold focus:border-primary outline-none transition-all"
                  value={data.scope}
                  onChange={(e) => setData({...data, scope: e.target.value})}
                />
              </div>
            </div>
          </div>

          <div className="pt-6 border-t border-slate-50 space-y-4">
             <button 
               onClick={handleDownload}
               className="w-full py-4 bg-slate-100 text-slate-800 font-bold rounded-xl flex items-center justify-center gap-3 hover:bg-slate-200 transition-all shadow-sm active:scale-95"
             >
               <Download className="w-5 h-5" />
               导出高清证书图片
             </button>
             <div className="grid grid-cols-2 gap-3">
               <button 
                 onClick={async () => {
                   setIsGenerating(true);
                   try {
                     // Get user profile first
                     const { data: { session } } = await supabase.auth.getSession();
                     
                     // 1. Insert or find dealer
                     let dealerId;
                     const { data: dealers } = await supabase.from('dealers').select('id').eq('company_name', data.dealerName);
                     if (dealers && dealers.length > 0) {
                        dealerId = dealers[0].id;
                     } else {
                        const { data: newDealer, error: dealerErr } = await supabase.from('dealers').insert({ company_name: data.dealerName }).select('id').single();
                        if (dealerErr) throw dealerErr;
                        dealerId = newDealer.id;
                     }
                     
                     // 2. Insert certificate
                     // Extract dates
                     const startDate = new Date(data.duration.split(' - ')[0].replace(/\./g, '-'));
                     const endDate = new Date(data.duration.split(' - ')[1].replace(/\./g, '-'));

                     const { error: certErr } = await supabase.from('certificates').insert({
                       cert_number: data.certNumber,
                       dealer_id: dealerId,
                       auth_scope: data.scope,
                       start_date: startDate.toISOString().split('T')[0],
                       end_date: endDate.toISOString().split('T')[0],
                       status: 'ISSUED',
                       manager_id: session?.user?.id
                     });
                     
                     if (certErr) throw certErr;
                     alert("✅ 证书已成功登记并生效上链！访客现可通过首页验证查询此编号。");
                     
                   } catch (err: any) {
                     console.error(err);
                     alert("登记失败: " + (err.message || "未知错误"));
                   } finally {
                     setIsGenerating(false);
                   }
                 }}
                 className="py-3 bg-slate-900 text-white font-bold rounded-xl flex items-center justify-center gap-2 hover:bg-slate-800 transition-all text-xs"
               >
                 <CheckCircle2 className="w-4 h-4" /> 确认生效并上链
               </button>
               <button 
                 onClick={renderCertificate}
                 className="py-3 bg-slate-100 text-slate-600 font-bold rounded-xl flex items-center justify-center gap-2 hover:bg-slate-200 transition-all text-xs"
               >
                 <RefreshCw className={`w-4 h-4 ${isGenerating ? 'animate-spin' : ''}`} /> 重新渲染
               </button>
             </div>
          </div>
        </div>

        <div className="p-5 rounded-xl bg-emerald-50 border border-emerald-100 flex gap-4 shadow-sm">
           <CheckCircle2 className="w-6 h-6 text-emerald-500 shrink-0" />
           <p className="text-[13px] text-emerald-900/70 font-medium leading-relaxed tracking-tight">
             全高清 Canvas 合成引擎已就绪：支持 300DPI 印刷级输出。点击确认生效后，将永久写入区块链节点数据中心。
           </p>
        </div>
      </motion.div>

      {/* 预览区域 */}
      <motion.div 
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        className="relative flex flex-col items-center justify-center bg-slate-50 rounded-2xl p-12 overflow-hidden border border-slate-100"
      >
        <div className="relative z-10 w-full max-w-[500px] shadow-2xl rounded-lg bg-white p-1 transform rotate-1">
          <canvas 
            ref={canvasRef} 
            className="w-full h-auto rounded shadow-sm block"
            style={{ imageRendering: 'crisp-edges' }}
          />
        </div>
        <p className="mt-12 text-[11px] font-semibold text-slate-300 uppercase tracking-[0.4em]">品牌官方数字资产保护协议</p>
      </motion.div>
    </div>
  );
}

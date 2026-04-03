"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Megaphone, Search, AlertTriangle, CheckCircle2, Clock, Image as ImageIcon, ExternalLink, X } from "lucide-react";
import { supabase } from "@/lib/supabase";

export default function ComplaintsPage() {
  const [complaints, setComplaints] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);

  useEffect(() => {
    fetchComplaints();
  }, []);

  const fetchComplaints = async () => {
    setIsLoading(true);
    const { data, error } = await supabase
      .from('complaints')
      .select('*')
      .order('created_at', { ascending: false });
      
    if (!error && data) {
      setComplaints(data);
    }
    setIsLoading(false);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'PENDING':
        return <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-amber-50 text-amber-700 text-[11px] font-semibold tracking-wide uppercase"><Clock className="w-3 h-3" /> 待处理</span>;
      case 'INVESTIGATING':
        return <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-blue-50 text-blue-700 text-[11px] font-semibold tracking-wide uppercase"><AlertTriangle className="w-3 h-3" /> 调查中</span>;
      case 'RESOLVED':
        return <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-emerald-50 text-emerald-700 text-[11px] font-semibold tracking-wide uppercase"><CheckCircle2 className="w-3 h-3" /> 已解决</span>;
      case 'REJECTED':
        return <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-slate-100 text-slate-600 text-[11px] font-semibold tracking-wide uppercase"><X className="w-3 h-3" /> 无效驳回</span>;
      default:
        return <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-slate-100 text-slate-600 text-[11px] font-semibold tracking-wide uppercase">{status}</span>;
    }
  };

  return (
    <div className="px-8 md:px-12 py-8 md:pt-10 md:pb-12 w-full max-w-7xl mx-auto flex flex-col flex-1 min-h-0">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-8">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-1">
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-3">
             <Megaphone className="w-7 h-7 text-[#eb5757]" />
             打假投诉审核中台
          </h1>
          <p className="text-slate-500 text-[13px]">查看并处理来自官网访客提交的侵权与假冒举报工单信息。</p>
        </motion.div>
      </div>

      <div className="notion-card flex-1 min-h-0 overflow-hidden flex flex-col p-0 border-t-[3px] border-t-[#eb5757]">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-white text-[13px]">
          <div className="flex items-center gap-6 text-slate-500 font-semibold">
             <span className="text-slate-900 border-b-2 border-slate-900 pb-1 cursor-pointer">全部工单</span>
             <span className="cursor-pointer hover:text-slate-900 transition-colors">待处理</span>
             <span className="cursor-pointer hover:text-slate-900 transition-colors">调查中</span>
          </div>
          <div className="relative w-full max-w-[240px]">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input 
              type="text" 
              placeholder="搜索工单号或涉事店铺..." 
              className="w-full bg-slate-50 border border-slate-200 rounded-md pl-9 pr-4 py-2 text-[13px] outline-none focus:border-[#eb5757] transition-colors"
            />
          </div>
        </div>

        <div className="overflow-auto flex-1 min-h-0">
          <table className="w-full text-left text-[13px] whitespace-nowrap">
            <thead className="bg-slate-50/80 text-slate-500 font-semibold uppercase tracking-wider text-xs">
              <tr>
                <th className="px-6 py-4 border-b border-slate-100">工单号 (ID)</th>
                <th className="px-6 py-4 border-b border-slate-100">涉事店铺/渠道</th>
                <th className="px-6 py-4 border-b border-slate-100">侵权描述</th>
                <th className="px-6 py-4 border-b border-slate-100">证据图片</th>
                <th className="px-6 py-4 border-b border-slate-100">提交时间</th>
                <th className="px-6 py-4 border-b border-slate-100">状态</th>
                <th className="px-6 py-4 border-b border-slate-100 text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 text-slate-700 font-medium">
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-slate-400">加载工单中...</td>
                </tr>
              ) : complaints.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-16">
                    <div className="flex flex-col items-center justify-center gap-3 text-slate-400 w-full">
                      <div className="w-12 h-12 bg-slate-50 rounded-full flex items-center justify-center text-slate-300">
                        <CheckCircle2 className="w-6 h-6" />
                      </div>
                      <span className="text-sm">太棒了，目前没有待处理的举报工单。</span>
                    </div>
                  </td>
                </tr>
              ) : (
                complaints.map((complaint) => (
                  <tr key={complaint.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-6 py-4 font-mono text-[10px] text-slate-400">{complaint.id.split('-')[0]}...</td>
                    <td className="px-6 py-4 font-bold text-slate-900">{complaint.channel || "-"}</td>
                    <td className="px-6 py-4 text-slate-500 max-w-[200px] truncate">{complaint.description}</td>
                    <td className="px-6 py-4">
                      {complaint.evidence_image_url ? (
                        <button onClick={() => setSelectedImage(complaint.evidence_image_url)} className="p-1.5 bg-slate-100 hover:bg-slate-200 rounded text-slate-600 transition-colors">
                           <ImageIcon className="w-4 h-4" />
                        </button>
                      ) : (
                        <span className="text-slate-300 text-xs">-</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-xs tabular-nums text-slate-500">
                      {new Date(complaint.created_at).toLocaleString()}
                    </td>
                    <td className="px-6 py-4">
                      {getStatusBadge(complaint.status)}
                    </td>
                    <td className="px-6 py-4 text-right">
                       <button className="text-[11px] font-bold text-blue-600 hover:underline flex items-center gap-1 justify-end w-full">
                          进入审核 <ExternalLink className="w-3 h-3" />
                       </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 图片预览模态框 */}
      {selectedImage && (
         <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-slate-900/80 backdrop-blur-sm" onClick={() => setSelectedImage(null)}>
            <div className="relative max-w-4xl w-full bg-white p-2 rounded-2xl shadow-2xl" onClick={e => e.stopPropagation()}>
               <button onClick={() => setSelectedImage(null)} className="absolute -top-12 right-0 text-white hover:text-slate-300 transition-colors">
                 <X className="w-8 h-8" />
               </button>
               <img src={selectedImage} alt="证据截图" className="w-full h-auto max-h-[80vh] object-contain rounded-xl" />
            </div>
         </div>
      )}
    </div>
  );
}

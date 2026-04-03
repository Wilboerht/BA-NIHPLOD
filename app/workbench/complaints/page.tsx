"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Megaphone, Search, AlertTriangle, CheckCircle2, Clock, Image as ImageIcon, ExternalLink, X } from "lucide-react";
import { supabase } from "@/lib/supabase";

export default function ComplaintsPage() {
  const [complaints, setComplaints] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState("ALL"); // ALL, PENDING, INVESTIGATING
  const [activeReviewId, setActiveReviewId] = useState<string | null>(null);
  const [reviewNote, setReviewNote] = useState("");

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

  const handleStatusUpdate = async (newStatus: string) => {
    if (!activeReviewId) return;
    const { error } = await supabase.from('complaints').update({ status: newStatus }).eq('id', activeReviewId);
    if (!error) {
       alert("工单状态已更新！");
       setActiveReviewId(null);
       fetchComplaints();
    } else {
       alert("更新失败：" + error.message);
    }
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

  const filteredComplaints = complaints.filter(c => {
    // 1. Tab filter
    if (activeTab === 'PENDING' && c.status !== 'PENDING') return false;
    if (activeTab === 'INVESTIGATING' && c.status !== 'INVESTIGATING') return false;
    
    // 2. Search filter
    const q = searchQuery.toLowerCase();
    if (q) {
      return (c.id.toLowerCase().includes(q) || (c.channel || "").toLowerCase().includes(q));
    }
    return true;
  });

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

      <div className="notion-card flex-1 min-h-0 overflow-hidden flex flex-col p-0">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-white text-[13px]">
          <div className="flex items-center gap-6 text-slate-500 font-semibold">
             <span onClick={() => setActiveTab("ALL")} className={`${activeTab === "ALL" ? "text-slate-900 border-b-2 border-slate-900 pb-1" : "hover:text-slate-900 transition-colors"} cursor-pointer`}>全部工单</span>
             <span onClick={() => setActiveTab("PENDING")} className={`${activeTab === "PENDING" ? "text-slate-900 border-b-2 border-slate-900 pb-1" : "hover:text-slate-900 transition-colors"} cursor-pointer`}>待处理</span>
             <span onClick={() => setActiveTab("INVESTIGATING")} className={`${activeTab === "INVESTIGATING" ? "text-slate-900 border-b-2 border-slate-900 pb-1" : "hover:text-slate-900 transition-colors"} cursor-pointer`}>调查中</span>
          </div>
          <div className="relative w-full max-w-[240px]">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input 
              type="text" 
              placeholder="搜索工单号或涉事店铺..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-md pl-9 pr-4 py-2 text-[13px] outline-none focus:border-slate-400 hover:border-slate-300 transition-colors shadow-sm"
            />
          </div>
        </div>

        <div className="overflow-auto flex-1 min-h-0 relative text-center">
          {isLoading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-slate-300 z-30 pointer-events-none">
              <div className="flex items-center gap-2 justify-center">
                <div className="w-1.5 h-1.5 rounded-full bg-slate-200 animate-pulse" />
                <div className="w-1.5 h-1.5 rounded-full bg-slate-300 animate-pulse delay-75" />
                <div className="w-1.5 h-1.5 rounded-full bg-slate-200 animate-pulse delay-150" />
              </div>
              <span className="text-[12px] font-medium tracking-widest uppercase">接入打假举报实时链路...</span>
            </div>
          )}
          <table className="w-full text-left text-[13px] whitespace-nowrap table-auto border-separate border-spacing-0">
            <thead className="text-slate-500 font-semibold uppercase tracking-wider text-xs bg-slate-50/80">
              <tr>
                <th className="px-6 py-4 border-b border-slate-100 sticky top-0 bg-slate-50/80 z-20 backdrop-blur-md">工单号 (ID)</th>
                <th className="px-6 py-4 border-b border-slate-100 sticky top-0 bg-slate-50/80 z-20 backdrop-blur-md">涉事店铺/渠道</th>
                <th className="px-6 py-4 border-b border-slate-100 sticky top-0 bg-slate-50/80 z-20 backdrop-blur-md">侵权描述</th>
                <th className="px-6 py-4 border-b border-slate-100 sticky top-0 bg-slate-50/80 z-20 backdrop-blur-md">证据图片</th>
                <th className="px-6 py-4 border-b border-slate-100 sticky top-0 bg-slate-50/80 z-20 backdrop-blur-md">提交时间</th>
                <th className="px-6 py-4 border-b border-slate-100 sticky top-0 bg-slate-50/80 z-20 backdrop-blur-md text-center">状态</th>
                <th className="px-6 py-4 border-b border-slate-100 text-right sticky top-0 bg-slate-50/80 z-20 backdrop-blur-md">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 text-slate-700 font-medium">
              {!isLoading && filteredComplaints.map((complaint) => (
                  <tr key={complaint.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-6 py-4 font-mono text-[10px] text-slate-400">{complaint.id.split('-')[0]}...</td>
                    <td className="px-6 py-4 font-bold text-slate-900">{complaint.channel || "-"}</td>
                    <td className="px-6 py-4 text-slate-500 max-w-[200px] truncate" title={complaint.description}>{complaint.description}</td>
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
                    <td className="px-6 py-4 text-center">
                      {getStatusBadge(complaint.status)}
                    </td>
                    <td className="px-6 py-4 text-right">
                       <button onClick={() => setActiveReviewId(complaint.id)} className="text-[11px] font-bold text-blue-600 hover:underline flex items-center gap-1 justify-end w-full uppercase tracking-wide">
                          进入审核 <ExternalLink className="w-3 h-3" />
                       </button>
                    </td>
                  </tr>
                ))
              }
            </tbody>
          </table>

          {!isLoading && filteredComplaints.length === 0 && (
            <div className="absolute inset-0 top-12 flex flex-col items-center justify-center gap-3 text-slate-400 pointer-events-none">
              <div className="w-12 h-12 bg-slate-50 rounded-full flex items-center justify-center text-slate-200">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <span className="text-[13px] font-medium tracking-tight">暂无匹配的举报工单记录</span>
            </div>
          )}
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

      {/* 审核面板模态框 */}
      {activeReviewId && (
         <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-slate-900/60 backdrop-blur-sm" onClick={() => setActiveReviewId(null)}>
            <div className="relative max-w-lg w-full bg-white rounded-2xl shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
               <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50">
                  <h3 className="font-bold text-slate-800 flex items-center gap-2"><Megaphone className="w-4 h-4 text-[#eb5757]" /> 工单审核操作面板</h3>
                  <button onClick={() => setActiveReviewId(null)} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
               </div>
               <div className="p-6 space-y-6">
                 <div>
                   <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-widest block mb-2">内部审核备注 (可选)</label>
                   <textarea 
                     className="w-full bg-slate-50 border border-slate-200 rounded-lg p-3 text-[13px] outline-none focus:border-blue-500 transition-all font-medium h-24" 
                     placeholder="请填写调查和处理记录..."
                     value={reviewNote}
                     onChange={e => setReviewNote(e.target.value)}
                   />
                 </div>
                 
                 <div className="grid grid-cols-1 gap-2 pt-2">
                    <button onClick={() => handleStatusUpdate('INVESTIGATING')} className="py-2.5 bg-blue-50 text-blue-700 hover:bg-blue-100 font-bold text-[13px] rounded-lg transition-colors flex items-center justify-center gap-2 block">
                       <AlertTriangle className="w-4 h-4" /> 标记为【调查中】
                    </button>
                    <button onClick={() => handleStatusUpdate('RESOLVED')} className="py-2.5 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 font-bold text-[13px] rounded-lg transition-colors flex items-center justify-center gap-2 block">
                       <CheckCircle2 className="w-4 h-4" /> 投诉核实，标记【已解决】
                    </button>
                    <button onClick={() => handleStatusUpdate('REJECTED')} className="py-2.5 bg-slate-100 text-slate-600 hover:bg-slate-200 font-bold text-[13px] rounded-lg transition-colors flex items-center justify-center gap-2 block">
                       <X className="w-4 h-4" /> 证据不足，直接【驳回】
                    </button>
                 </div>
               </div>
            </div>
         </div>
      )}
    </div>
  );
}

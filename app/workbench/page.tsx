"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { supabase } from "@/lib/supabase";
import { Clock, ExternalLink, ShieldCheck, Megaphone } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function WorkbenchPage() {
  const router = useRouter();
  const [stats, setStats] = useState({ certs: 0, pendingComplaints: 0 });
  const [recentComplaints, setRecentComplaints] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadDashboard() {
      setIsLoading(true);
      // Fetch Certs Count
      const { count: certCount } = await supabase
        .from('certificates')
        .select('*', { count: 'exact', head: true });
        
      // Fetch Pending Complaints Count
      const { count: complaintCount } = await supabase
        .from('complaints')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'PENDING');

      // Fetch Recent Pending Complaints
      const { data: recent } = await supabase
        .from('complaints')
        .select('id, channel, description, created_at, status')
        .eq('status', 'PENDING')
        .order('created_at', { ascending: false })
        .limit(4);

      setStats({ certs: certCount || 0, pendingComplaints: complaintCount || 0 });
      if (recent) setRecentComplaints(recent);
      setIsLoading(false);
    }
    loadDashboard();
  }, []);

  return (
    <div className="px-8 md:px-12 py-8 md:pt-10 md:pb-12 w-full max-w-7xl mx-auto flex flex-col flex-1 min-h-0">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-1 mb-8"
      >
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">工作台概览</h1>
        <p className="text-slate-500 text-[13px]">欢迎来到 NIHPLOD 品牌授权核查系统的管理大盘。</p>
      </motion.div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <motion.div 
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.05 }}
          onClick={() => router.push('/workbench/certificates')}
          className="notion-card flex items-center justify-between cursor-pointer hover:border-slate-300 hover:shadow-sm transition-all group"
        >
          <div>
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-3">累计核发证书</h3>
            <p className="text-3xl font-bold text-slate-900 tracking-tight group-hover:text-primary transition-colors">{isLoading ? '-' : stats.certs}</p>
          </div>
          <div className="w-12 h-12 rounded-full bg-slate-50 flex items-center justify-center text-slate-300 group-hover:bg-orange-50 group-hover:text-primary transition-colors">
             <ShieldCheck className="w-6 h-6" />
          </div>
        </motion.div>
        
        <motion.div 
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.1 }}
          onClick={() => router.push('/workbench/complaints')}
          className="notion-card flex items-center justify-between cursor-pointer hover:border-slate-300 hover:shadow-sm transition-all group"
        >
          <div>
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-3">待审投诉工单</h3>
            <p className="text-3xl font-bold text-red-600 tracking-tight group-hover:text-[#eb5757] transition-colors">{isLoading ? '-' : stats.pendingComplaints}</p>
          </div>
          <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center text-red-300 group-hover:bg-red-100 group-hover:text-[#eb5757] transition-colors">
             <Megaphone className="w-6 h-6" />
          </div>
        </motion.div>
      </div>
      
      <div className="flex-1 notion-card flex flex-col p-0 overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-white">
          <h3 className="text-sm font-bold text-slate-800">最新待处理举报</h3>
          <Link href="/workbench/complaints" className="text-[11px] font-bold text-slate-500 hover:text-slate-900 transition-colors uppercase tracking-widest">
            进入处理中心 →
          </Link>
        </div>
        <div className="flex-1 min-h-0 overflow-auto bg-slate-50/30 p-2">
           {isLoading ? (
             <div className="p-8 text-center text-xs text-slate-400 font-medium">加载数据中...</div>
           ) : recentComplaints.length === 0 ? (
             <div className="p-8 text-center flex flex-col items-center justify-center h-full">
                <div className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center text-slate-400 mb-3">
                   <Clock className="w-5 h-5" />
                </div>
                <p className="text-sm font-semibold text-slate-600">一切井然有序</p>
                <p className="text-xs text-slate-400 mt-1">目前没有任何积压的待处理工单。</p>
             </div>
           ) : (
             <div className="space-y-2">
               {recentComplaints.map(complaint => (
                 <div key={complaint.id} className="bg-white p-4 rounded-xl border border-slate-100 flex items-center justify-between hover:shadow-sm transition-shadow">
                   <div>
                     <div className="flex items-center gap-3 mb-1.5">
                       <span className="text-[10px] font-mono text-slate-400 bg-slate-50 px-2 py-0.5 rounded">{complaint.id.split('-')[0]}</span>
                       <span className="text-xs font-bold text-slate-900">{complaint.channel}</span>
                     </div>
                     <p className="text-[13px] text-slate-500 line-clamp-1">{complaint.description}</p>
                   </div>
                   <Link href={`/workbench/complaints?id=${complaint.id}`} className="shrink-0 p-2 text-slate-300 hover:text-slate-900 hover:bg-slate-50 rounded-lg transition-colors">
                     <ExternalLink className="w-4 h-4" />
                   </Link>
                 </div>
               ))}
             </div>
           )}
        </div>
      </div>
    </div>
  );
}

"use client";

import { motion } from "framer-motion";

export default function WorkbenchPage() {
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

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
        <motion.div 
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.05 }}
          className="notion-card cursor-pointer"
        >
          <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-3">累计核发证书</h3>
          <p className="text-3xl font-bold text-slate-900 tracking-tight">0</p>
        </motion.div>
        
        <motion.div 
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.1 }}
          className="notion-card cursor-pointer"
        >
          <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-3">待审投诉工单</h3>
          <p className="text-3xl font-bold text-red-600 tracking-tight">0</p>
        </motion.div>
      </div>
      
      <div className="flex-1 notion-card flex items-center justify-center border-dashed">
        <p className="text-slate-300 font-bold text-sm tracking-widest uppercase">Select an action from sidebar</p>
      </div>
    </div>
  );
}

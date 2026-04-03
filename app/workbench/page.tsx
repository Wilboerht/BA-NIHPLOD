"use client";

import { motion } from "framer-motion";

export default function WorkbenchPage() {
  return (
    <div className="p-8 md:p-12 max-w-7xl mx-auto h-full flex flex-col">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-2 mb-10"
      >
        <h1 className="text-3xl font-extrabold text-slate-800 tracking-tight">工作台概览</h1>
        <p className="text-slate-500 text-sm font-medium">欢迎来到 NIHPLOD 品牌授权核查系统的管理大盘。</p>
      </motion.div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
        <motion.div 
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.05 }}
          className="notion-card cursor-pointer"
        >
          <h3 className="text-sm font-bold text-slate-500 uppercase tracking-widest mb-4">累计核发证书</h3>
          <p className="text-4xl font-black text-slate-900 tracking-tighter">0</p>
        </motion.div>
        
        <motion.div 
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.1 }}
          className="notion-card cursor-pointer"
        >
          <h3 className="text-sm font-bold text-slate-500 uppercase tracking-widest mb-4">待审投诉工单</h3>
          <p className="text-4xl font-black text-red-600 tracking-tighter">0</p>
        </motion.div>
      </div>
      
      <div className="flex-1 notion-card flex items-center justify-center border-dashed">
        <p className="text-slate-300 font-bold text-sm tracking-widest uppercase">Select an action from sidebar</p>
      </div>
    </div>
  );
}

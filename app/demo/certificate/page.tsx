"use client";

import CertificateGenerator from "@/components/certificate/CertificateGenerator";
import { ArrowLeft, Share2, Printer, Layers } from "lucide-react";
import Link from "next/link";
import { motion } from "framer-motion";

export default function CertDemoPage() {
  return (
    <main className="min-h-screen bg-white">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/70 backdrop-blur-xl border-b border-slate-100 p-4 lg:px-12 flex items-center justify-between">
        <div className="flex items-center gap-8">
          <Link href="/" className="group p-2 hover:bg-slate-50 rounded-full transition-colors order-last md:order-first">
            <ArrowLeft className="w-5 h-5 text-slate-400 group-hover:text-slate-900" />
          </Link>
          <div className="flex items-center gap-4">
             <div className="w-10 h-10 bg-slate-900 rounded-2xl flex items-center justify-center shadow-lg shadow-slate-200">
               <Layers className="w-5 h-5 text-white" />
             </div>
             <div>
               <h1 className="text-xl font-black text-slate-900 tracking-tight">授权书引擎</h1>
               <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest leading-none">Canvas Synthesis v1.0</p>
             </div>
          </div>
        </div>

        <div className="hidden md:flex items-center gap-4">
          <button className="px-6 py-2.5 text-xs font-black text-slate-400 hover:text-slate-900 transition-colors uppercase tracking-widest">
            预览文档
          </button>
          <button className="px-6 py-2.5 bg-slate-900 text-white text-xs font-black rounded-xl hover:bg-slate-800 transition-all shadow-xl shadow-slate-200">
            打印设置
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <div className="max-w-[1600px] mx-auto pt-16 pb-32">
        <div className="px-8 mb-16">
           <motion.div 
             initial={{ opacity: 0, y: 10 }}
             animate={{ opacity: 1, y: 0 }}
             className="max-w-3xl"
           >
             <h2 className="text-5xl font-black text-slate-900 mb-6 tracking-tighter">系统合成测试沙盘</h2>
             <p className="text-slate-500 font-medium leading-relaxed text-lg italic">
               由 nihplod.cn 提供技术背书的自动化授权书合成引擎。<br />
               我们将非结构化数据转化为具有法律效应与视觉权威性的数字证书。
             </p>
           </motion.div>
        </div>

        {/* The Generator Component */}
        <div className="px-8">
          <CertificateGenerator />
        </div>
      </div>

      {/* Legend Footer */}
      <footer className="fixed bottom-0 left-0 w-full p-5 bg-white/80 backdrop-blur-md border-t border-slate-100 z-50">
        <div className="max-w-screen-xl mx-auto flex flex-wrap gap-12 justify-center text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">
           <div className="flex items-center gap-3 decoration-primary decoration-2 underline-offset-4 underline">
             中文字体衬线渲染
           </div>
           <div className="flex items-center gap-3">
             高清倍率 (300DPI)
           </div>
           <div className="flex items-center gap-3">
             动态防伪 ID 填充
           </div>
           <div className="flex items-center gap-3">
             数字公章像素级合成
           </div>
        </div>
      </footer>
    </main>
  );
}

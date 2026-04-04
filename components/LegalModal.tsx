"use client";

import { motion, AnimatePresence } from "framer-motion";
import { X, ShieldCheck, Scale } from "lucide-react";

interface LegalModalProps {
  isOpen: boolean;
  onClose: () => void;
  type: "service" | "privacy";
}

export default function LegalModal({ isOpen, onClose, type }: LegalModalProps) {
  const isService = type === "service";
  const title = isService ? "服务协议" : "隐私声明";
  const Icon = isService ? Scale : ShieldCheck;

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 md:p-6">
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-slate-900/20 backdrop-blur-md"
          />
          <motion.div 
            initial={{ opacity: 0, scale: 0.98, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, y: 20 }}
            className="relative w-full max-w-2xl bg-white rounded-[32px] shadow-2xl flex flex-col max-h-[85vh] overflow-hidden border border-slate-100"
          >
            {/* Header */}
            <div className="p-8 pb-6 flex justify-between items-center bg-white shrink-0">
               <div className="flex items-center gap-4">
                  <div className="w-11 h-11 rounded-xl bg-slate-50 flex items-center justify-center text-slate-800">
                     <Icon size={22} />
                  </div>
                  <h3 className="text-xl font-black text-slate-900 tracking-[0.12em] leading-none">{title}</h3>
               </div>
               <button 
                 onClick={onClose}
                 className="w-10 h-10 flex items-center justify-center rounded-full bg-slate-50 text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-all active:scale-90"
               >
                 <X size={18} />
               </button>
            </div>

            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto px-10 pb-10 custom-scrollbar">
              <div className="max-w-none space-y-9 text-slate-600 leading-relaxed text-[14px]">
                {isService ? (
                  <>
                    <section className="space-y-2">
                      <h4 className="text-slate-900 font-extrabold text-[15px] tracking-wide">一、协议声明</h4>
                      <p>欢迎使用 NIHPLOD (旎柏) 品牌授权核验系统。本协议是您与旎柏（上海）商贸有限公司之间关于系统使用的法律协议。通过访问或使用本系统，即表示您已阅读、理解并同意受本协议条款的约束。</p>
                    </section>
                    <section className="space-y-2">
                      <h4 className="text-slate-900 font-extrabold text-[15px] tracking-wide">二、授权核验服务</h4>
                      <p>本系统仅作为品牌官方授权资质的公开查询渠道。查询结果基于系统数据库实时记录，旨在为消费者和合作伙伴提供合规性核查。任何未经授权的对此系统数据的恶意抓取、篡改或商业利用均为违规行为。</p>
                    </section>
                    <section className="space-y-2">
                      <h4 className="text-slate-900 font-extrabold text-[15px] tracking-wide">三、知识产权</h4>
                      <p>本系统内的所有内容，包括但不限于 LOGO、软件代码、设计布局、证书样式及防伪技术，均受知识产权法律保护。未经书面许可，严禁以任何形式进行复制或二次分发。</p>
                    </section>
                    <section className="space-y-2">
                      <h4 className="text-slate-900 font-extrabold text-[15px] tracking-wide">四、责任限制</h4>
                      <p>系统致力于提供准确的动态数据，但对于因网络环境、不可抗力或第三方干扰导致的瞬时数据延迟，品牌方在法律允许范围内不承担直接责任。</p>
                    </section>
                  </>
                ) : (
                  <>
                    <section className="space-y-2">
                      <h4 className="text-slate-900 font-extrabold text-[15px] tracking-wide">一、数据收集</h4>
                      <p>在本核验流程中，我们遵循“最小化原则”，仅在您提交举报或申请时收集必要的联系方式与证据信息。常规的查询核验操作不会记录您的个人身份生物特征。</p>
                    </section>
                    <section className="space-y-2">
                      <h4 className="text-slate-900 font-extrabold text-[15px] tracking-wide">二、数据安全</h4>
                      <p>我们采用行业标准的安全防护技术对系统数据进行加密存储。查询日志仅用于系统优化与品牌打假追溯，严禁向任何第三方商业机构出售相关信息。</p>
                    </section>
                    <section className="space-y-2">
                      <h4 className="text-slate-900 font-extrabold text-[15px] tracking-wide">三、Cookie 使用</h4>
                      <p>本系统可能会使用基础的会话技术以确保查询流程的连贯性及防御分布式攻击（DDoS）。这些技术不包含您的个人隐私偏好追踪。</p>
                    </section>
                    <section className="space-y-2">
                      <h4 className="text-slate-900 font-extrabold text-[15px] tracking-wide">四、您的权利</h4>
                      <p>根据相关法律法规，您有权随时联系我们要求撤回已提交的反馈信息，或就数据处理方式进行咨询。我们的隐私合规团队将竭诚为您服务。</p>
                    </section>
                  </>
                )}
              </div>
            </div>
            
            {/* Footer shadow fade */}
            <div className="h-8 bg-gradient-to-t from-white to-transparent absolute bottom-0 left-0 right-0 pointer-events-none" />
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

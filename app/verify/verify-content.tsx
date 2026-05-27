"use client";

import { useSearchParams } from "next/navigation";
import { useState, useEffect } from "react";
import { CheckCircle2, XCircle, Loader2, Home, Calendar, User } from "lucide-react";
import { motion } from "framer-motion";
import Link from "next/link";
import { parseAuthScope, getEndOfDay } from "@/lib/utils";
import { fetchWithTimeout } from "@/lib/fetch";
import { BRAND_NAME, BRAND_NAME_CN } from "@/lib/config";

interface Certificate {
  cert_number: string;
  status: string;
  start_date: string;
  end_date: string;
  auth_scope: string;
  company_name?: string;
  phone?: string;
  dealers?: { company_name: string; phone?: string };
}

export default function VerifyPageContent() {
  const searchParams = useSearchParams();
  const certId = searchParams.get("cert");

  const [certificate, setCertificate] = useState<Certificate | null>(null);
  const [isExpired, setIsExpired] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // 验证证书号格式 BAVP-YYYY-XXXX（支持 0-9 和 A-F）
  const isValidCertNumber = (certNum: string | null): boolean => {
    if (!certNum) return false;
    return /^BAVP-\d{4}-[0-9A-F]{4}$/i.test(certNum);
  };

  useEffect(() => {
    if (!isValidCertNumber(certId)) {
      setError("证书号格式不正确");
      setLoading(false);
      return;
    }

    const fetchCertificate = async () => {
      try {
        // 使用服务端 API 查询，与主页验证逻辑一致
        const response = await fetchWithTimeout("/api/certificates/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ certNumber: certId || "" })
        });

        const result = await response.json();

        if (!response.ok || !result.success) {
          setError(result.error || "查询失败，请稍后重试");
          setLoading(false);
          return;
        }

        const data = result.data;

        // 检查有效期（使用 getEndOfDay 避免时区问题）
        const endDate = getEndOfDay(data.end_date);
        if (new Date() > endDate) {
          setIsExpired(true);
        }

        setCertificate(data);
        setLoading(false);
      } catch (err: unknown) {
        console.error("Certificate verification error:", err);
        setError("查询失败，请检查网络连接");
        setLoading(false);
      }
    };

    fetchCertificate();
  }, [certId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#FAFAFA] relative overflow-hidden flex items-center justify-center px-4">
        {/* 矿物纹理叠加 */}
        <div className="absolute inset-0 pointer-events-none opacity-[0.03] z-0"
             style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E\")" }} />
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          className="relative z-10 w-full max-w-md bg-[#FDFBF7] border border-[#E8E0D5]/40 rounded-[24px] shadow-2xl p-10 text-center"
        >
          <Loader2 className="w-10 h-10 animate-spin text-[#8B7355] mx-auto mb-4" />
          <p className="text-[#2C2A29] font-semibold tracking-wide">正在验证证书...</p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FAFAFA] relative overflow-hidden flex flex-col items-center px-4 py-8 md:py-12">
      {/* 矿物纹理叠加 */}
      <div className="absolute inset-0 pointer-events-none opacity-[0.03] z-0"
           style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E\")" }} />

      {/* 顶部导航 */}
      <nav className="w-full max-w-2xl flex justify-between items-center z-20 mb-8 md:mb-10">
        <div className="flex items-center gap-3">
          <img src="/NIHPLOD-logo.svg" alt="NIHPLOD" className="h-6 w-auto" />
          <div className="w-px h-4 bg-slate-300/60" />
          <span className="text-xs font-medium tracking-[0.15em] uppercase text-[#2C2A29]">授权核验中心</span>
        </div>
        <Link
          href="/"
          className="group flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#8B7355]/5 hover:bg-[#8B7355]/10 border border-[#8B7355]/10 hover:border-[#8B7355]/20 text-xs font-semibold tracking-[0.05em] text-[#8B7355] hover:text-[#6B5346] transition-all"
        >
          <Home className="w-3.5 h-3.5 opacity-70 group-hover:opacity-100 transition-opacity" />
          <span>返回主页</span>
        </Link>
      </nav>

      {/* 主内容 */}
      <div className="w-full max-w-2xl relative z-10">
        {error ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="relative w-full bg-[#FDFBF7] border border-[#E8E0D5]/40 rounded-[24px] shadow-2xl overflow-hidden"
          >
            <div className="p-6 md:p-10">
              <div className="flex flex-col items-center text-center gap-6">
                <img src="/NIHPLOD-logo.svg" alt="NIHPLOD" className="h-8 w-auto mb-2" />
                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-red-600 text-[10px] font-bold tracking-[0.15em] bg-red-50 px-3 py-1.5 rounded-full border border-red-200 w-fit mx-auto">
                    <XCircle className="w-3.5 h-3.5" /> 验证失败
                  </div>
                  <p className="text-lg md:text-[22px] text-[#2C2A29] font-bold tracking-wide leading-snug">
                    {error}
                  </p>
                  <p className="text-[13px] md:text-[15px] text-[#8B7355]/80 leading-relaxed max-w-md mx-auto">
                    请核查您填写的检索信息是否准确无误。<br className="hidden md:block" />
                    为保障您的权益，如遇疑似未经官方授权的商业行为，请向我们提交反馈。
                  </p>
                </div>
              </div>
            </div>
          </motion.div>
        ) : certificate ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="relative w-full bg-[#FDFBF7] border border-[#E8E0D5]/40 rounded-[24px] shadow-2xl overflow-hidden"
          >
            {/* 上半部分：核心信息 */}
            <div className="p-6 md:p-10 space-y-6 md:space-y-8">
              <div className="flex items-center gap-2 text-[#8B7355] text-[10px] font-bold tracking-[0.15em] bg-[#8B7355]/5 px-3 py-1.5 rounded-full border border-[#8B7355]/20 w-fit shadow-sm shadow-[#8B7355]/5">
                <CheckCircle2 className="w-3 h-3 md:w-3.5 md:h-3.5" /> 官方授权企业资质认证
              </div>

              <div>
                <h2 className="text-2xl md:text-[30px] font-black text-[#2C2A29] tracking-[0.05em] leading-snug break-words">
                  {certificate.dealers?.company_name || certificate.company_name}
                </h2>
                <div className="flex items-center gap-3 mt-4">
                  <span className="text-[9px] md:text-[10px] bg-[#8B7355]/10 text-[#8B7355] border border-[#8B7355]/20 px-2 py-0.5 rounded font-black uppercase tracking-widest leading-relaxed">SN</span>
                  <p className="text-[#8B7355] text-[11px] md:text-[13px] font-bold tracking-widest font-mono pt-[1px]">
                    {certificate.cert_number}
                  </p>
                </div>
              </div>
            </div>

            {/* 票据风格下半部分 */}
            <div className="relative flex flex-col gap-6 md:gap-8 pt-8 md:pt-10 border-t border-dashed border-[#8B7355]/20 bg-slate-50/60 px-6 md:px-10 pb-8 md:pb-10 rounded-b-[24px]">
              <div className="space-y-3 md:space-y-4 relative z-10">
                <span className="text-[10px] md:text-[11px] text-[#8B7355] uppercase tracking-[0.2em] leading-none block font-bold">授权有效期限</span>
                <div className="flex items-center gap-3 flex-wrap">
                  <p className="text-[15px] md:text-lg text-[#2C2A29] tracking-wider font-semibold">
                    {new Date(certificate.start_date).toLocaleDateString("zh-CN")} 至{" "}
                    {new Date(certificate.end_date).toLocaleDateString("zh-CN")}
                  </p>
                  {isExpired ? (
                    <span className="text-[10px] md:text-[11px] px-2.5 py-0.5 rounded-md border font-bold tracking-widest leading-relaxed whitespace-nowrap bg-red-50 text-red-600 border-red-200">
                      已过期
                    </span>
                  ) : (
                    <span className="text-[10px] md:text-[11px] px-2.5 py-0.5 rounded-md border font-bold tracking-widest leading-relaxed whitespace-nowrap bg-emerald-50 text-emerald-600 border-emerald-200">
                      有效期内
                    </span>
                  )}
                </div>
              </div>

              <div className="space-y-3 md:space-y-4 relative z-10">
                <span className="text-[10px] md:text-[11px] text-[#8B7355] uppercase tracking-[0.2em] leading-none block font-bold">授权经营范围</span>
                <p className="text-[13px] md:text-[15px] text-[#2C2A29] leading-[2] md:leading-[1.9] font-medium opacity-80 whitespace-pre-wrap break-words">
                  {parseAuthScope(certificate.auth_scope).scopeText || certificate.auth_scope}
                </p>
              </div>

              {/* 验证时间 */}
              <div className="text-center pt-2 relative z-10">
                <p className="text-[10px] text-[#8B7355]/60 tracking-widest">
                  验证时间：{new Date().toLocaleString("zh-CN")}
                </p>
              </div>
            </div>
          </motion.div>
        ) : null}

        {/* 底部说明 */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="mt-8 bg-[#8B7355]/5 border border-[#8B7355]/15 rounded-2xl p-5 md:p-6"
        >
          <p className="text-[13px] font-bold text-[#8B7355] mb-2 tracking-wide">验证说明</p>
          <ul className="list-disc list-inside space-y-1 text-[#8B7355]/80 text-[13px] leading-relaxed">
            <li>此证书由 {BRAND_NAME}（{BRAND_NAME_CN}）官方签发</li>
            <li>
              如发现侵权冒充，请立即
              <Link href="/" className="text-[#8B7355] hover:text-[#6B5346] hover:underline ml-1 font-semibold transition-colors">
                提交举报
              </Link>
            </li>
            <li>验证结果实时更新，最后的书面证明以官方文件为准</li>
          </ul>
        </motion.div>
      </div>
    </div>
  );
}

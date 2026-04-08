"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { FileText, Download, LogOut, Loader2, ShieldCheck, Clock } from "lucide-react";
import { supabase } from "@/lib/supabase";

interface UserInfo {
  id: string;
  phone: string;
  username: string;
  full_name: string;
  role: string;
}

interface Certificate {
  id: string;
  cert_number: string;
  start_date: string;
  end_date: string;
  status: string;
  final_image_url?: string;
}

export default function DealerPage() {
  const [user, setUser] = useState<UserInfo | null>(null);
  const [certificates, setCertificates] = useState<Certificate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDownloading, setIsDownloading] = useState<string | null>(null);

  // 页面挂载时检查用户身份和获取证书
  useEffect(() => {
    const initPage = async () => {
      const userStr = sessionStorage.getItem("user");
      if (!userStr) {
        window.location.href = "/";
        return;
      }

      const userData = JSON.parse(userStr) as UserInfo;
      
      // 只允许DEALER角色访问
      if (userData.role !== "DEALER") {
        window.location.href = "/workbench";
        return;
      }

      setUser(userData);
      await fetchCertificates(userData.id);
      setIsLoading(false);
    };

    initPage();
  }, []);

  const fetchCertificates = useCallback(async (userId: string) => {
    try {
      // 根据profile_id找到对应的dealer
      const { data: dealer } = await supabase
        .from("dealers")
        .select("id")
        .eq("profile_id", userId)
        .single();

      if (!dealer) return;

      // 获取该dealer的所有证书
      const { data: certs } = await supabase
        .from("certificates")
        .select("*")
        .eq("dealer_id", dealer.id)
        .eq("status", "ISSUED")
        .order("created_at", { ascending: false });

      setCertificates(certs || []);
    } catch (error) {
      console.error("获取证书失败:", error);
    }
  }, []);

  const handleDownload = async (cert: Certificate) => {
    if (!cert.final_image_url) return;

    setIsDownloading(cert.id);
    try {
      const response = await fetch(cert.final_image_url);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${cert.cert_number}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("下载失败:", error);
      alert("下载失败，请重试");
    } finally {
      setIsDownloading(null);
    }
  };

  const handleLogout = () => {
    sessionStorage.removeItem("user");
    window.location.href = "/";
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center">
        <div className="text-center space-y-3">
          <Loader2 className="w-8 h-8 animate-spin mx-auto text-slate-400" />
          <p className="text-slate-500">加载中...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-6">
      <div className="max-w-2xl mx-auto">
        {/* 顶部用户信息 */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{user?.full_name}</h1>
            <p className="text-slate-500 text-sm">{user?.phone}</p>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg transition-colors"
          >
            <LogOut className="w-4 h-4" />
            退出登录
          </button>
        </div>

        {/* 证书列表悬浮面板 */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-[24px] shadow-lg border border-slate-100/50"
        >
          <div className="p-8">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center">
                <FileText className="w-5 h-5 text-blue-500" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-slate-900">我的授权证书</h2>
                <p className="text-sm text-slate-500">共 {certificates.length} 张证书</p>
              </div>
            </div>

            {certificates.length === 0 ? (
              <div className="py-12 text-center">
                <ShieldCheck className="w-12 h-12 text-slate-200 mx-auto mb-3" />
                <p className="text-slate-400">暂无证书</p>
              </div>
            ) : (
              <div className="space-y-3">
                {certificates.map((cert) => {
                  const now = new Date();
                  const endDate = new Date(cert.end_date + "T23:59:59");
                  const isExpired = now > endDate;

                  return (
                    <motion.div
                      key={cert.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="flex items-center justify-between p-4 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors border border-slate-100"
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="font-mono font-bold text-slate-900">{cert.cert_number}</p>
                          {isExpired ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-slate-200 text-slate-600 text-[10px] font-bold rounded">
                              已失效
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-100 text-emerald-600 text-[10px] font-bold rounded">
                              <ShieldCheck className="w-3 h-3" />
                              生效中
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1 text-xs text-slate-500">
                          <Clock className="w-3 h-3" />
                          {cert.start_date.replace(/-/g, ".")} - {cert.end_date.replace(/-/g, ".")}
                        </div>
                      </div>

                      <button
                        onClick={() => handleDownload(cert)}
                        disabled={isDownloading === cert.id || !cert.final_image_url}
                        className="ml-4 flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 disabled:bg-slate-300 text-white font-bold text-sm rounded-lg transition-colors disabled:cursor-not-allowed"
                      >
                        {isDownloading === cert.id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Download className="w-4 h-4" />
                        )}
                        {isDownloading === cert.id ? "下载中..." : "下载"}
                      </button>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </div>
        </motion.div>

        {/* 底部说明 */}
        <div className="mt-8 text-center text-xs text-slate-400">
          <p>NIHPLOD GENOME - 品牌数字化授权保护系统</p>
        </div>
      </div>
    </div>
  );
}

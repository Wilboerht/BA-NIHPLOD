"use client";

import { useSearchParams } from "next/navigation";
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { CheckCircle2, XCircle, Loader2, Home, Calendar, User, Phone } from "lucide-react";
import Link from "next/link";

export default function VerifyPage() {
  const searchParams = useSearchParams();
  const certId = searchParams.get("cert");
  
  const [certificate, setCertificate] = useState<any>(null);
  const [isExpired, setIsExpired] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // 验证证书号格式 BAVP-YYYY-XXXX
  const isValidCertNumber = (certNum: string | null): boolean => {
    if (!certNum) return false;
    return /^BAVP-\d{4}-\d{4}$/.test(certNum);
  };

  useEffect(() => {
    if (!isValidCertNumber(certId)) {
      setError("证书号格式不正确");
      setLoading(false);
      return;
    }

    const fetchCertificate = async () => {
      try {
        // 直接解码 certId
        const decodedCertId = decodeURIComponent(certId || "");
        
        const { data, error: dbError } = await supabase
          .from("certificates")
          .select("*, dealers(company_name, phone)")
          .eq("cert_number", decodedCertId)
          .single();

        // 处理查询错误
        if (dbError) {
          if (dbError.code === "PGRST116") {
            // 没有找到记录
            setError("证书不存在");
          } else {
            setError("查询失败，请稍后重试");
          }
          setLoading(false);
          return;
        }

        if (!data) {
          setError("证书不存在");
          setLoading(false);
          return;
        }

        // 检查证书状态
        if (data.status !== "ISSUED") {
          if (data.status === "PENDING") {
            setError("证书未生效，请等待审核");
          } else if (data.status === "EXPIRED") {
            setError("证书已过期");
          } else {
            setError(`证书状态异常：${data.status}`);
          }
          setLoading(false);
          return;
        }

        // 检查有效期
        const endDate = new Date(data.end_date);
        if (new Date() > endDate) {
          setIsExpired(true);
        }

        setCertificate(data);
        setLoading(false);
      } catch (err: any) {
        console.error("Certificate verification error:", err);
        setError("查询失败，请检查网络连接");
        setLoading(false);
      }
    };

    fetchCertificate();
  }, [certId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center">
        <div className="bg-white rounded-2xl shadow-xl p-12 text-center">
          <Loader2 className="w-12 h-12 animate-spin text-blue-500 mx-auto mb-4" />
          <p className="text-slate-600 font-medium">正在验证证书...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 py-12 px-4">
      <div className="max-w-2xl mx-auto">
        {/* 返回主页按钮 */}
        <Link href="/" className="inline-flex items-center gap-2 text-slate-600 hover:text-slate-900 mb-8 transition-colors">
          <Home className="w-4 h-4" />
          <span className="text-sm font-medium">返回主页</span>
        </Link>

        {/* 验证结果卡片 */}
        {error ? (
          <div className="bg-white rounded-2xl shadow-xl overflow-hidden">
            <div className="bg-gradient-to-r from-red-500 to-red-600 p-8 text-white text-center">
              <XCircle className="w-20 h-20 mx-auto mb-4 opacity-90" />
              <h1 className="text-3xl font-bold mb-3">验证失败</h1>
              <p className="text-red-50 text-lg">{error}</p>
            </div>
            <div className="p-8 text-center">
              <p className="text-slate-600 mb-6">
                如果您认为这是一个错误，请联系我们的客服：
              </p>
              <a href="tel:+8621123456" className="text-blue-600 hover:text-blue-700 font-medium">
                +86 21 1234 5678
              </a>
            </div>
          </div>
        ) : certificate ? (
          <div className="bg-white rounded-2xl shadow-xl overflow-hidden">
            {/* 验证通过头部 */}
            <div className="bg-gradient-to-r from-emerald-500 to-emerald-600 p-8 text-white text-center">
              <CheckCircle2 className="w-20 h-20 mx-auto mb-4 opacity-90" />
              <h1 className="text-3xl font-bold mb-2">✓ 证书真实有效</h1>
              <p className="text-emerald-50 text-lg">NIHPLOD(旎柏) 官方认证</p>
            </div>

            {/* 证书信息 */}
            <div className="p-8 space-y-6">
              {/* 证书号 */}
              <div className="border-b border-slate-200 pb-6">
                <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-2">证书编号</h2>
                <p className="text-2xl font-bold text-slate-900 font-mono">{certificate.cert_number}</p>
              </div>

              {/* 经销商信息 */}
              <div>
                <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4">经销商信息</h2>
                <div className="space-y-3 bg-slate-50 p-4 rounded-lg">
                  <div className="flex items-center gap-3">
                    <User className="w-5 h-5 text-slate-400" />
                    <div>
                      <p className="text-xs text-slate-500">经销商名称</p>
                      <p className="text-slate-900 font-semibold">{certificate.dealers?.company_name}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Phone className="w-5 h-5 text-slate-400" />
                    <div>
                      <p className="text-xs text-slate-500">联系电话</p>
                      <p className="text-slate-900 font-semibold">
                        {certificate.dealers?.phone || "未登记"}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* 授权范围 */}
              <div>
                <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-2">授权范围</h2>
                <p className="text-slate-700 whitespace-pre-wrap bg-slate-50 p-4 rounded-lg leading-relaxed">
                  {certificate.auth_scope}
                </p>
              </div>

              {/* 有效期 */}
              <div>
                <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-2">有效期</h2>
                <div className="flex items-center gap-2 text-slate-900 font-semibold">
                  <Calendar className="w-5 h-5 text-slate-400" />
                  <span>
                    {new Date(certificate.start_date).toLocaleDateString("zh-CN")} 至{" "}
                    {new Date(certificate.end_date).toLocaleDateString("zh-CN")}
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-2">
                  {isExpired ? (
                    <span className="text-red-600 font-semibold">⚠ 已过期</span>
                  ) : (
                    <span className="text-emerald-600 font-semibold">
                      ✓ 有效期内 (剩余{" "}
                      {Math.ceil(
                        (new Date(certificate.end_date).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)
                      )}{" "}
                      天)
                    </span>
                  )}
                </p>
              </div>

              {/* 验证时间 */}
              <div className="text-center pt-6 border-t border-slate-200">
                <p className="text-xs text-slate-500">
                  验证时间：{new Date().toLocaleString("zh-CN")}
                </p>
              </div>
            </div>
          </div>
        ) : null}

        {/* 底部说明 */}
        <div className="mt-8 bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-900">
          <p className="font-semibold mb-2">💡 验证说明</p>
          <ul className="list-disc list-inside space-y-1 text-blue-800">
            <li>此证书由 NIHPLOD(旎柏) 官方签发</li>
            <li>如发现侵权冒充，请立即
              <Link href="/complaints" className="text-blue-600 hover:underline ml-1">
                提交举报
              </Link>
            </li>
            <li>验证结果实时更新，最后的书面证明以官方文件为准</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

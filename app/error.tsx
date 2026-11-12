"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[Error]", error);
  }, [error]);

  useEffect(() => {
    document.body.classList.add("ba-error-page");
    // 首页本身出错时不要自动跳转，避免 5 秒循环刷新
    if (window.location.pathname === "/") {
      return () => document.body.classList.remove("ba-error-page");
    }
    const timer = setTimeout(() => {
      window.location.href = "/";
    }, 8000);
    return () => {
      document.body.classList.remove("ba-error-page");
      clearTimeout(timer);
    };
  }, []);

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-[#FAFAFA] px-6">
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-xl">
        <p className="text-sm font-semibold text-slate-800">页面加载出错</p>
        <p className="mt-2 text-xs text-slate-500">请重试，或返回首页继续操作。</p>
        <div className="mt-5 flex justify-center gap-3">
          <button
            type="button"
            onClick={reset}
            className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-slate-800"
          >
            重试
          </button>
          <Link
            href="/"
            className="rounded-xl bg-slate-100 px-4 py-2.5 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-200"
          >
            返回首页
          </Link>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useEffect } from "react";
import "./globals.css";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[GlobalError]", error);
  }, [error]);

  useEffect(() => {
    if (window.location.pathname === "/") return;
    const timer = setTimeout(() => {
      window.location.href = "/";
    }, 8000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <html>
      <head>
        <title>NIHPLOD | 系统错误</title>
      </head>
      <body>
        <div className="min-h-screen flex items-center justify-center bg-[#FAFAFA] px-6">
          <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-xl">
            <p className="text-sm font-semibold text-slate-800">系统错误</p>
            <p className="mt-2 text-xs text-slate-500">请重试，或返回首页继续操作。</p>
            <div className="mt-5 flex justify-center gap-3">
              <button
                type="button"
                onClick={reset}
                className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-slate-800"
              >
                重试
              </button>
              <button
                type="button"
                onClick={() => { window.location.href = "/"; }}
                className="rounded-xl bg-slate-100 px-4 py-2.5 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-200"
              >
                返回首页
              </button>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}

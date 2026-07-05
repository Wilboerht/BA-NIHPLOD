"use client";

import { useEffect } from "react";

export default function ErrorBoundary({
  error,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[Error]", error);
  }, [error]);

  useEffect(() => {
    const timer = setTimeout(() => {
      window.location.href = "/";
    }, 5000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <>
      <style>{`nav { display: none !important; }`}</style>
      <div className="fixed inset-0 flex items-center justify-center bg-[#FAFAFA] z-[200]">
        <p className="text-sm text-slate-500">页面加载出错，即将返回首页...</p>
      </div>
    </>
  );
}

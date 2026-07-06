"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[GlobalError]", error);
  }, [error]);

  useEffect(() => {
    const timer = setTimeout(() => {
      window.location.href = "/";
    }, 5000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <html>
      <head>
        <title>NIHPLOD | 系统错误</title>
      </head>
      <body>
        <div className="min-h-screen flex items-center justify-center bg-[#FAFAFA]">
          <p className="text-sm text-slate-500">系统错误，即将返回首页...</p>
        </div>
      </body>
    </html>
  );
}

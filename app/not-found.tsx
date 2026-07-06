import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: {
    absolute: "页面未找到 | NIHPLOD 授权核验",
  },
  robots: { index: false, follow: false },
};

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#FAFAFA] p-6">
      <div className="bg-white rounded-2xl shadow-xl p-10 max-w-md w-full text-center">
        <div className="text-6xl font-black text-[#8B7355] mb-4">404</div>
        <h1 className="text-xl font-bold text-slate-900 mb-2">页面未找到</h1>
        <p className="text-slate-500 text-sm mb-8">
          您访问的页面不存在或已被移除。
        </p>
        <Link
          href="/"
          className="inline-block px-6 py-3 bg-[#8B7355] text-white rounded-xl text-sm font-bold hover:bg-[#6B5346] transition-colors"
        >
          返回首页
        </Link>
      </div>
    </div>
  );
}

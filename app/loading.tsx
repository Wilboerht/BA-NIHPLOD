export default function HomeLoading() {
  return (
    <main className="min-h-screen bg-[#F6F4F0] flex flex-col items-center justify-center">
      <div className="flex-1 flex flex-col items-center justify-center w-full max-w-4xl px-5 md:px-8">
        <div className="w-full flex flex-col items-center gap-8">
          {/* 标题骨架 */}
          <div className="text-center space-y-4">
            <div className="h-12 md:h-14 w-64 md:w-80 bg-[#E8E0D5]/50 rounded-lg animate-pulse" />
            <div className="h-5 w-80 md:w-96 bg-[#E8E0D5]/40 rounded animate-pulse" />
          </div>

          {/* 搜索框骨架 */}
          <div className="w-full max-w-2xl">
            <div className="h-12 md:h-14 w-full bg-white/60 border border-slate-100 rounded-[28px] md:rounded-[32px] animate-pulse" />
          </div>
        </div>
      </div>

      {/* 页脚骨架 */}
      <div className="w-full py-6 border-t border-slate-100/30 flex justify-center">
        <div className="h-4 w-48 bg-[#E8E0D5]/30 rounded animate-pulse" />
      </div>
    </main>
  );
}

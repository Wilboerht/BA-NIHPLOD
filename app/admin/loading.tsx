export default function AdminLoading() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#FAFAFA]">
      <div className="flex flex-col items-center gap-3">
        <div className="w-6 h-6 border-2 border-slate-300 border-t-slate-900 rounded-full animate-spin" />
        <p className="text-xs text-slate-500">加载中...</p>
      </div>
    </div>
  );
}

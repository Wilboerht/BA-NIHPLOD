import { Suspense } from "react";
import VerifyPageContent from "./verify-content";
import { Loader2 } from "lucide-react";

function VerifyPageLoading() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center">
      <div className="bg-white rounded-2xl shadow-xl p-12 text-center">
        <Loader2 className="w-12 h-12 animate-spin text-blue-500 mx-auto mb-4" />
        <p className="text-slate-600 font-medium">正在验证证书...</p>
      </div>
    </div>
  );
}

export default function VerifyPage() {
  return (
    <Suspense fallback={<VerifyPageLoading />}>
      <VerifyPageContent />
    </Suspense>
  );
}

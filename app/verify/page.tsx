import { redirect } from "next/navigation";

export default function VerifyPage({
  searchParams,
}: {
  searchParams: Promise<{ cert?: string }>;
}) {
  // 重定向到首页，由首页模态框处理验证
  const cert = searchParams.then((sp) => sp.cert);
  // 使用同步重定向：如果有 cert 参数则带上，否则直接跳首页
  return (
    <VerifyRedirect certPromise={cert} />
  );
}

async function VerifyRedirect({ certPromise }: { certPromise: Promise<string | undefined> }) {
  const cert = await certPromise;
  if (cert) {
    redirect(`/?cert=${encodeURIComponent(cert)}`);
  }
  redirect("/");
}

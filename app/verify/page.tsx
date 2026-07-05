import { redirect } from "next/navigation";

export default async function VerifyPage({
  searchParams,
}: {
  searchParams: Promise<{ cert?: string }>;
}) {
  const { cert } = await searchParams;
  if (cert) {
    redirect(`/?cert=${encodeURIComponent(cert)}`);
  }
  redirect("/");
}

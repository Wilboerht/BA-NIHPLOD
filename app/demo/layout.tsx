import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "证书样式预览",
  robots: { index: false, follow: false },
  alternates: { canonical: "/demo/certificate" },
};

export default function DemoLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

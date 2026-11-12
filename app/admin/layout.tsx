import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "管理员登录",
  robots: { index: false, follow: false },
  alternates: { canonical: "/admin/login" },
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

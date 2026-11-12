import type { Metadata } from "next";
import WorkbenchShell from "./workbench-shell";

export const metadata: Metadata = {
  title: "管理后台",
  robots: { index: false, follow: false },
  alternates: { canonical: "/workbench" },
};

export default function WorkbenchLayout({ children }: { children: React.ReactNode }) {
  return <WorkbenchShell>{children}</WorkbenchShell>;
}

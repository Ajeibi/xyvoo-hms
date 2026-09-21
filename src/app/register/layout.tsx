import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Register your hotel",
  description: "Set up your XYVOO HMS account and launch your hotel's own branded system.",
  alternates: { canonical: "/register" },
};

export default function RegisterLayout({ children }: { children: ReactNode }) {
  return children;
}

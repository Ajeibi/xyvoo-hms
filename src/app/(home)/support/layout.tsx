import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Support",
  description: "How can we help? Real humans, real answers, usually within minutes.",
  alternates: { canonical: "/support" },
};

export default function SupportLayout({ children }: { children: ReactNode }) {
  return children;
}

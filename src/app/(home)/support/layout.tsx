import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Support",
  description:
    "Help articles, FAQs, and how to reach the XYVOO team for support with your HMS or Storefront.",
  alternates: { canonical: "/support" },
};

export default function SupportLayout({ children }: { children: ReactNode }) {
  return children;
}

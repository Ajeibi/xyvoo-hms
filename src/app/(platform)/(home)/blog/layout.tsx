import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Blog",
  description:
    "Practical guides, data-driven insights, and hotel management ideas from the XYVOO team.",
  alternates: { canonical: "/blog" },
};

export default function BlogLayout({ children }: { children: ReactNode }) {
  return children;
}

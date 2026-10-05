import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "For Growing Retailers",
  description:
    "Marketing, team access and reporting that scale alongside your storefront, in XYVOO Storefront.",
  alternates: { canonical: "/business-types/growing-retailers" },
};

export default function StorefrontGrowingRetailersLayout({ children }: { children: ReactNode }) {
  return children;
}

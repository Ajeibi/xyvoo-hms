import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "For Solo Sellers & New Businesses",
  description:
    "A storefront, catalogue and checkout you can run by yourself, live the same day, in XYVOO Storefront.",
  alternates: { canonical: "/business-types/solo-sellers" },
};

export default function StorefrontSoloSellersLayout({ children }: { children: ReactNode }) {
  return children;
}

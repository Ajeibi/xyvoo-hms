import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Inventory & Wholesale",
  description:
    "Product bundles, barcode generation and wholesale/MOQ pricing, built into the same catalogue you already manage in XYVOO Storefront.",
  alternates: { canonical: "/solution/storefront/inventory" },
};

export default function StorefrontInventoryLayout({ children }: { children: ReactNode }) {
  return children;
}

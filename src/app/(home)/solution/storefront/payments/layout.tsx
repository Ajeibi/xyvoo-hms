import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Payments & Gift Cards",
  description:
    "Paystack checkout, gift cards, and receipts — all handled inside XYVOO Storefront, without a separate payment tool.",
  alternates: { canonical: "/solution/storefront/payments" },
};

export default function StorefrontPaymentsLayout({ children }: { children: ReactNode }) {
  return children;
}

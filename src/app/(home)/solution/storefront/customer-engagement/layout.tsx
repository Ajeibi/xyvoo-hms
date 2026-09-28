import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Customer Engagement",
  description:
    "Customer segments, loyalty points, back-in-stock alerts, abandoned cart recovery and referrals — built into XYVOO Storefront, not bolted on.",
  alternates: { canonical: "/solution/storefront/customer-engagement" },
};

export default function StorefrontCustomerEngagementLayout({ children }: { children: ReactNode }) {
  return children;
}

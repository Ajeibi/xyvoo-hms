import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Finance, HR & Analytics",
  description:
    "Staff, F&B revenue, billing and reporting: the side of your property that has to add up, in XYVOO HMS.",
  alternates: { canonical: "/solution/hms/finance-analytics" },
};

export default function HmsFinanceAnalyticsLayout({ children }: { children: ReactNode }) {
  return children;
}

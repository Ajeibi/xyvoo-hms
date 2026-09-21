import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "Simple plans that scale with your business. Start free, grow at your pace, and move to advanced support only when you need it — no hidden lock-ins.",
  alternates: { canonical: "/pricing" },
};

export default function PricingLayout({ children }: { children: ReactNode }) {
  return children;
}

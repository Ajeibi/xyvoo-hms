import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Storefront",
  description:
    "One connected operating system for your online business. Storefront to checkout, catalogue to fulfilment — every part of your shop runs under your brand, connected in real time.",
  alternates: { canonical: "/solution/storefront" },
};

export default function StorefrontSolutionLayout({ children }: { children: ReactNode }) {
  return children;
}

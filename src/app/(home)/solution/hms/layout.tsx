import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Hotel Management System",
  description:
    "One connected operating system for your entire property. Front desk to housekeeping, F&B to finance — every department runs under your brand, connected in real time.",
  alternates: { canonical: "/solution/hms" },
};

export default function HmsSolutionLayout({ children }: { children: ReactNode }) {
  return children;
}

import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Operations & Facilities",
  description:
    "Housekeeping, maintenance and procurement: the operational side of your property, kept in sync in XYVOO HMS.",
  alternates: { canonical: "/solution/hms/operations" },
};

export default function HmsOperationsLayout({ children }: { children: ReactNode }) {
  return children;
}

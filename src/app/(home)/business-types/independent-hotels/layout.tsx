import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "For Independent Hotels",
  description:
    "Rooms, check-in and billing in one system, built for owner-operators running a single property in XYVOO HMS.",
  alternates: { canonical: "/business-types/independent-hotels" },
};

export default function HmsIndependentHotelsLayout({ children }: { children: ReactNode }) {
  return children;
}

import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "For Hotel Groups & Multi-Property",
  description:
    "Reservations, staff and reporting across every property in your portfolio, connected in real time in XYVOO HMS.",
  alternates: { canonical: "/business-types/hotel-groups" },
};

export default function HmsHotelGroupsLayout({ children }: { children: ReactNode }) {
  return children;
}

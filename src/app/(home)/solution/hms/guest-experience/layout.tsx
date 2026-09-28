import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Guest Experience",
  description:
    "Rooms, reservations and front office — the guest-facing side of your property, connected in real time in XYVOO HMS.",
  alternates: { canonical: "/solution/hms/guest-experience" },
};

export default function HmsGuestExperienceLayout({ children }: { children: ReactNode }) {
  return children;
}

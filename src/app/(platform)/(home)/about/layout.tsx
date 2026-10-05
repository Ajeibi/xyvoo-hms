import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "About us",
  description:
    "XYVOO was founded by hoteliers, for hoteliers. Learn why we built dedicated, fully branded platforms for hotels and online retailers instead of one system stretched to cover both.",
  alternates: { canonical: "/about" },
};

export default function AboutLayout({ children }: { children: ReactNode }) {
  return children;
}

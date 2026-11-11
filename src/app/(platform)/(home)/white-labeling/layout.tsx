import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "How white-labelling works",
  description:
    "XYVOO runs quietly behind your business. See exactly what your guests, customers and staff see: your logo, your colours and your name, never ours.",
  alternates: { canonical: "/white-labeling" },
};

export default function WhiteLabelingLayout({ children }: { children: ReactNode }) {
  return children;
}

import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Website templates",
  description:
    "See what your XYVOO storefront could look like. Every template is a complete brand website with the shop built in: pages, journal, accounts and checkout.",
  alternates: { canonical: "/templates" },
};

export default function TemplatesLayout({ children }: { children: ReactNode }) {
  return children;
}

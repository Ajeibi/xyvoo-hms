import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Register your storefront",
  description: "Set up your merchant account to start managing products and orders on XYVOO.",
  alternates: { canonical: "/register/storefront" },
};

export default function RegisterStorefrontLayout({ children }: { children: ReactNode }) {
  return children;
}

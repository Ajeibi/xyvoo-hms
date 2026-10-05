import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to your XYVOO HMS account.",
  alternates: { canonical: "/auth/login" },
};

export default function LoginLayout({ children }: { children: ReactNode }) {
  return children;
}

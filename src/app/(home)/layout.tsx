import type { Metadata } from "next";
import type { ReactNode } from "react";
import WebsiteLayout from "@/components/website/WebsiteLayout";

export const metadata: Metadata = {
  title: "Software that runs your business — not the other way round",
  description:
    "XYVOO builds dedicated, fully branded platforms for hotels and online retailers, so your team runs on one system instead of ten disconnected tools.",
  alternates: { canonical: "/" },
};

/**
 * Shared across every marketing/website page. Kept as a real route-group
 * layout (rather than each page wrapping itself) so the header, footer, and
 * the Brand CTA background video stay mounted across client-side navigation
 * instead of restarting from frame zero on every page change.
 */
export default function MarketingLayout({ children }: { children: ReactNode }) {
  return <WebsiteLayout>{children}</WebsiteLayout>;
}

import type { ReactNode } from "react";
import WebsiteLayout from "@/components/website/WebsiteLayout";

/**
 * Shared across every marketing/website page. Kept as a real route-group
 * layout (rather than each page wrapping itself) so the header, footer, and
 * the Brand CTA background video stay mounted across client-side navigation
 * instead of restarting from frame zero on every page change.
 */
export default function MarketingLayout({ children }: { children: ReactNode }) {
  return <WebsiteLayout>{children}</WebsiteLayout>;
}

import type { Metadata } from "next";
import StoreCart from "@/components/storefront-theme/StoreCart";

export const metadata: Metadata = { title: "Your basket", robots: { index: false, follow: true } };

export default function StorefrontCartPage() {
  return <StoreCart />;
}

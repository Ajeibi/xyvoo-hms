import type { Metadata } from "next";
import { notFound } from "next/navigation";
import StoreCart from "@/components/storefront-theme/StoreCart";
import { getStorefront } from "@/lib/store/site/storefront";

export const metadata: Metadata = { title: "Your basket", robots: { index: false, follow: true } };

export default async function StorefrontCartPage({ params }: { params: Promise<{ slug: string }> }) {
  if (!(await getStorefront((await params).slug))) notFound();
  return <StoreCart />;
}

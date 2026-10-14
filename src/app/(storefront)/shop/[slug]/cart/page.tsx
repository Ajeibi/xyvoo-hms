import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import RestoreBasket from "@/components/storefront-theme/RestoreBasket";
import StoreCart from "@/components/storefront-theme/StoreCart";
import { getStorefront } from "@/lib/store/site/storefront";

export const metadata: Metadata = { title: "Your basket", robots: { index: false, follow: true } };

export default async function StorefrontCartPage({ params }: { params: Promise<{ slug: string }> }) {
  if (!(await getStorefront((await params).slug))) notFound();
  return (
    <>
      {/* A basket reminder email links here with ?restore=, to put the basket back. */}
      <Suspense fallback={null}>
        <RestoreBasket />
      </Suspense>
      <StoreCart />
    </>
  );
}

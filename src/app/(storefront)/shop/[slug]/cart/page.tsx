import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import RestoreBasket from "@/components/storefront-theme/RestoreBasket";
import StoreCart from "@/components/storefront-theme/StoreCart";
import { getShopT } from "@/lib/store/i18n/server";
import { getStorefront } from "@/lib/store/site/storefront";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const storefront = await getStorefront((await params).slug);
  const title = storefront ? getShopT(storefront)("checkout.basketTitle") : "Your basket";
  return { title, robots: { index: false, follow: true } };
}

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

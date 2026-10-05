import type { Metadata } from "next";
import { notFound } from "next/navigation";
import StoreOrderResult from "@/components/storefront-theme/StoreOrderResult";
import { getStorefront } from "@/lib/store/site/storefront";

export const metadata: Metadata = { title: "Order confirmation", robots: { index: false, follow: false } };

export default async function StorefrontCheckoutCallbackPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ reference?: string; trxref?: string }>;
}) {
  if (!(await getStorefront((await params).slug))) notFound();
  const { reference, trxref } = await searchParams;
  return (
    <div className="container section">
      <StoreOrderResult reference={reference || trxref || ""} />
    </div>
  );
}

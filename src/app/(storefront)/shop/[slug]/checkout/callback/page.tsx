import type { Metadata } from "next";
import StoreOrderResult from "@/components/storefront-theme/StoreOrderResult";

export const metadata: Metadata = { title: "Order confirmation", robots: { index: false, follow: false } };

export default async function StorefrontCheckoutCallbackPage({
  searchParams,
}: {
  searchParams: Promise<{ reference?: string; trxref?: string }>;
}) {
  const { reference, trxref } = await searchParams;
  return (
    <div className="container section">
      <StoreOrderResult reference={reference || trxref || ""} />
    </div>
  );
}

import CheckoutCallbackClient from "@/components/shop/CheckoutCallbackClient";

export default async function ShopCheckoutCallbackPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ reference?: string; trxref?: string }>;
}) {
  const { slug } = await params;
  const { reference, trxref } = await searchParams;

  return (
    <div className="mx-auto max-w-lg px-6 py-16">
      <CheckoutCallbackClient slug={slug} reference={reference || trxref || ""} />
    </div>
  );
}

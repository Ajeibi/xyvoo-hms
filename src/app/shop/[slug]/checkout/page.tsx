import CheckoutFormClient from "@/components/shop/CheckoutFormClient";

export default async function ShopCheckoutPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="text-xl font-semibold text-slate-900">Checkout</h1>
      <div className="mt-6">
        <CheckoutFormClient slug={slug} />
      </div>
    </div>
  );
}

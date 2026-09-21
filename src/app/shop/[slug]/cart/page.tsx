import CartClient from "@/components/shop/CartClient";

export default async function ShopCartPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="text-xl font-semibold text-slate-900">Your cart</h1>
      <div className="mt-6">
        <CartClient slug={slug} />
      </div>
    </div>
  );
}

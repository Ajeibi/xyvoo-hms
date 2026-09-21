import Link from "next/link";
import ProductGrid from "@/components/shop/ProductGrid";

export default async function ShopHomePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-xl font-semibold text-slate-900">Shop</h1>
        <Link href={`/shop/${slug}/products`} className="text-sm font-medium text-xyvoo-blue hover:underline">
          View all products →
        </Link>
      </div>
      <div className="mt-6">
        <ProductGrid slug={slug} />
      </div>
    </div>
  );
}

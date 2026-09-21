import { Search } from "lucide-react";
import ProductGrid from "@/components/shop/ProductGrid";

export default async function ShopProductsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ search?: string; category?: string }>;
}) {
  const { slug } = await params;
  const { search, category } = await searchParams;

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-xl font-semibold text-slate-900">All products</h1>
        <form className="relative w-full sm:w-72" method="get">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            name="search"
            defaultValue={search || ""}
            placeholder="Search products…"
            className="w-full rounded-xl border border-slate-200 py-2.5 pl-9 pr-3 text-sm"
          />
          {category ? <input type="hidden" name="category" value={category} /> : null}
        </form>
      </div>

      <div className="mt-6">
        <ProductGrid slug={slug} category={category} search={search} emptyMessage="No products match your search." />
      </div>
    </div>
  );
}

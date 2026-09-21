"use client";

import { useEffect, useState } from "react";
import ProductCard from "@/components/shop/ProductCard";
import type { ShopProduct } from "@/lib/shop/products";

export default function ProductGrid({
  slug,
  category,
  search,
  emptyMessage = "No products found.",
}: {
  slug: string;
  category?: string;
  search?: string;
  emptyMessage?: string;
}) {
  const [products, setProducts] = useState<ShopProduct[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    /* eslint-disable react-hooks/set-state-in-effect -- reset to loading state when the filters (deps) change, before the new fetch resolves */
    setProducts(null);
    setError(null);
    /* eslint-enable react-hooks/set-state-in-effect */

    const query = new URLSearchParams();
    if (category) query.set("category", category);
    if (search) query.set("search", search);

    fetch(`/api/shop/${encodeURIComponent(slug)}/products?${query.toString()}`)
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Failed to load products.");
        if (!cancelled) setProducts(data.products || []);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Something went wrong.");
      });

    return () => {
      cancelled = true;
    };
  }, [slug, category, search]);

  if (error) return <p className="text-sm text-red-500">{error}</p>;

  if (!products) {
    return (
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="aspect-square animate-pulse rounded-2xl bg-slate-100" />
        ))}
      </div>
    );
  }

  if (products.length === 0) {
    return <p className="py-16 text-center text-sm text-slate-500">{emptyMessage}</p>;
  }

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
      {products.map((product) => (
        <ProductCard key={product.id} slug={slug} product={product} />
      ))}
    </div>
  );
}

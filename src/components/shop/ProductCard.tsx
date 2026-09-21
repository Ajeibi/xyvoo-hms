import Link from "next/link";
import { ImageOff } from "lucide-react";
import { formatShopCurrency } from "@/lib/shop/format";
import type { ShopProduct } from "@/lib/shop/products";

export default function ProductCard({ slug, product }: { slug: string; product: ShopProduct }) {
  const href = product.slug ? `/shop/${slug}/products/${product.slug}` : `/shop/${slug}/products`;

  return (
    <Link
      href={href}
      className="group flex flex-col overflow-hidden rounded-2xl border border-slate-200 transition-shadow hover:shadow-md"
    >
      <div className="flex aspect-square items-center justify-center overflow-hidden bg-slate-50">
        {product.imageUrl ? (
          <img
            src={product.imageUrl}
            alt={product.name}
            className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
          />
        ) : (
          <ImageOff className="h-8 w-8 text-slate-300" />
        )}
      </div>
      <div className="flex flex-1 flex-col gap-1 p-4">
        {product.brand ? <p className="text-[11px] uppercase tracking-wide text-slate-400">{product.brand}</p> : null}
        <p className="line-clamp-2 text-sm font-medium text-slate-900">{product.name}</p>
        <div className="mt-auto flex items-center gap-2 pt-1">
          <span className="text-sm font-semibold text-slate-900">
            {formatShopCurrency(product.price, product.currency)}
          </span>
          {product.compareAtPrice && product.compareAtPrice > product.price ? (
            <span className="text-xs text-slate-400 line-through">
              {formatShopCurrency(product.compareAtPrice, product.currency)}
            </span>
          ) : null}
        </div>
        {!product.inStock ? <p className="text-xs font-medium text-red-500">Out of stock</p> : null}
      </div>
    </Link>
  );
}

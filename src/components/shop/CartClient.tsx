"use client";

import Link from "next/link";
import { ImageOff, Minus, Plus, X } from "lucide-react";
import { useCartStore } from "@/components/shop/CartProvider";
import { calculateCartTotals } from "@/lib/shop/cart";
import { formatShopCurrency } from "@/lib/shop/format";

export default function CartClient({ slug }: { slug: string }) {
  const lines = useCartStore((s) => s.lines);
  const hasHydrated = useCartStore((s) => s.hasHydrated);
  const updateQuantity = useCartStore((s) => s.updateQuantity);
  const removeLine = useCartStore((s) => s.removeLine);

  const { subtotal, currency } = calculateCartTotals(lines);

  // A cart with items lives in localStorage, so on a fresh page load its
  // contents arrive a tick after the initial render -- treat "not yet
  // hydrated" as unknown rather than confidently claiming it's empty.
  if (!hasHydrated) {
    return <div className="h-40 animate-pulse rounded-2xl bg-slate-50" />;
  }

  if (lines.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-200 py-16 text-center">
        <p className="text-sm text-slate-500">Your cart is empty.</p>
        <Link href={`/shop/${slug}/products`} className="mt-3 inline-block text-sm font-medium text-xyvoo-blue hover:underline">
          Continue shopping →
        </Link>
      </div>
    );
  }

  return (
    <div>
      <ul className="divide-y divide-slate-100 rounded-2xl border border-slate-200">
        {lines.map((line) => (
          <li key={`${line.productId}:${line.variantId || ""}`} className="flex items-center gap-4 p-4">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-slate-50">
              {line.imageUrl ? (
                <img src={line.imageUrl} alt={line.name} className="h-full w-full object-cover" />
              ) : (
                <ImageOff className="h-5 w-5 text-slate-300" />
              )}
            </div>

            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-slate-900">{line.name}</p>
              {line.variantLabel ? <p className="text-xs text-slate-500">{line.variantLabel}</p> : null}
              <p className="mt-1 text-sm text-slate-600">{formatShopCurrency(line.unitPrice, line.currency)}</p>
            </div>

            <div className="flex items-center rounded-lg border border-slate-200">
              <button
                type="button"
                aria-label="Decrease quantity"
                onClick={() => updateQuantity(line.productId, line.variantId, line.quantity - 1)}
                className="p-2 text-slate-500 hover:text-slate-800"
              >
                <Minus className="h-3.5 w-3.5" />
              </button>
              <span className="w-8 text-center text-sm">{line.quantity}</span>
              <button
                type="button"
                aria-label="Increase quantity"
                onClick={() =>
                  updateQuantity(
                    line.productId,
                    line.variantId,
                    Math.min(line.quantity + 1, line.maxQuantity || line.quantity + 1),
                  )
                }
                className="p-2 text-slate-500 hover:text-slate-800"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>

            <button
              type="button"
              aria-label="Remove item"
              onClick={() => removeLine(line.productId, line.variantId)}
              className="p-2 text-slate-400 hover:text-red-500"
            >
              <X className="h-4 w-4" />
            </button>
          </li>
        ))}
      </ul>

      <div className="mt-6 flex items-center justify-between border-t border-slate-100 pt-6">
        <span className="text-sm text-slate-600">Subtotal</span>
        <span className="text-lg font-semibold text-slate-900">{formatShopCurrency(subtotal, currency)}</span>
      </div>

      <Link
        href={`/shop/${slug}/checkout`}
        className="mt-4 block w-full rounded-lg bg-xyvoo-blue py-3 text-center text-sm font-semibold text-white"
      >
        Proceed to checkout
      </Link>
    </div>
  );
}

"use client";

import Link from "next/link";
import { ShoppingBag, Store } from "lucide-react";
import { CartProvider, useCartStore } from "@/components/shop/CartProvider";

function CartBadge({ slug }: { slug: string }) {
  const itemCount = useCartStore((s) => s.lines.reduce((sum, l) => sum + l.quantity, 0));

  return (
    <Link
      href={`/shop/${slug}/cart`}
      className="relative flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
    >
      <ShoppingBag className="h-4 w-4" />
      Cart
      {itemCount > 0 ? (
        <span className="absolute -right-2 -top-2 flex h-5 min-w-5 items-center justify-center rounded-full bg-xyvoo-blue px-1 text-[11px] font-bold text-white">
          {itemCount}
        </span>
      ) : null}
    </Link>
  );
}

export default function ShopLayoutShell({
  slug,
  storeDisplayName,
  logoUrl,
  children,
}: {
  slug: string;
  storeDisplayName: string;
  logoUrl: string | null;
  children: React.ReactNode;
}) {
  return (
    <CartProvider slug={slug}>
      <div className="flex min-h-screen flex-col bg-white">
        <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-4">
            <Link href={`/shop/${slug}`} className="flex items-center gap-2">
              {logoUrl ? (
                <img src={logoUrl} alt={storeDisplayName} className="h-8 w-8 rounded-lg object-contain" />
              ) : (
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-800 text-white">
                  <Store className="h-4 w-4" />
                </div>
              )}
              <span className="text-base font-semibold text-slate-900">{storeDisplayName}</span>
            </Link>

            <nav className="hidden items-center gap-6 sm:flex">
              <Link href={`/shop/${slug}`} className="text-sm font-medium text-slate-600 hover:text-slate-900">
                Home
              </Link>
              <Link href={`/shop/${slug}/products`} className="text-sm font-medium text-slate-600 hover:text-slate-900">
                Shop
              </Link>
            </nav>

            <CartBadge slug={slug} />
          </div>
        </header>

        <main className="flex-1">{children}</main>

        <footer className="border-t border-slate-200 py-8">
          <div className="mx-auto max-w-6xl px-6 text-center text-xs text-slate-400">
            Powered by <span className="font-semibold text-slate-500">XYVOO</span> — {storeDisplayName}
          </div>
        </footer>
      </div>
    </CartProvider>
  );
}

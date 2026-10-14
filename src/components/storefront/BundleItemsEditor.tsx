"use client";

import { useEffect, useState } from "react";
import { Minus, Plus, Search, Trash2 } from "lucide-react";
import { formatShopCurrency } from "@/lib/shop/format";
import { DashAlert, dashButton, dashInput, sendJson } from "./dashboard-ui";

type Item = {
  id: string;
  component_product_id: string;
  quantity: number;
  component: { id: string; name: string; sku: string | null; image_url: string | null; price: number; stock: number; allow_backorder: boolean } | null;
};
/** A product from the dashboard list, which gives its price as sellingPrice. */
type Match = { id: string; name: string; sellingPrice?: number; price?: number };

const focusRing = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-xyvoo-blue focus-visible:ring-offset-2";

/**
 * "What's in this bundle" on the product form. The bundle's stock is worked out
 * from these items, and selling a bundle takes each item out of stock.
 */
export default function BundleItemsEditor({
  slug,
  productId,
  price,
  currency,
  onCountChange,
}: {
  slug: string;
  productId: string;
  /** The bundle's own price, to show the saving against buying separately. */
  price: number;
  currency: string | null;
  onCountChange?: (count: number) => void;
}) {
  const [items, setItems] = useState<Item[] | null>(null);
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<Match[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const base = `/api/store/products/${productId}/bundle-items`;
  const money = (n: number) => formatShopCurrency(n, currency);

  const load = () =>
    fetch(`${base}?slug=${encodeURIComponent(slug)}`)
      .then((res) => res.json())
      .then((body) => {
        const list = (body.items || []) as Item[];
        setItems(list);
        onCountChange?.(list.length);
      })
      .catch(() => setError("We couldn't load what's in this bundle."));

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId]);

  // Search the shop's products to add (simple products only; the API checks again).
  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) return;
    const timer = window.setTimeout(() => {
      fetch(`/api/store/products/list?slug=${encodeURIComponent(slug)}&page=1&q=${encodeURIComponent(term)}`)
        .then((res) => res.json())
        .then((body) => setMatches(((body.products || []) as Match[]).filter((p) => p.id !== productId).slice(0, 6)))
        .catch(() => setMatches([]));
    }, 300);
    return () => window.clearTimeout(timer);
  }, [query, slug, productId]);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError("");
    try {
      await fn();
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const add = (m: Match) =>
    run(async () => {
      await sendJson(base, "POST", { slug, component_product_id: m.id, quantity: 1 });
      setQuery("");
      setMatches([]);
    });
  const setQty = (item: Item, quantity: number) => (quantity < 1 ? undefined : run(() => sendJson(base, "PATCH", { slug, itemId: item.id, quantity })));
  const remove = (item: Item) => run(() => sendJson(`${base}?slug=${encodeURIComponent(slug)}&itemId=${item.id}`, "DELETE"));

  const separately = (items || []).reduce((s, i) => s + (Number(i.component?.price) || 0) * i.quantity, 0);
  const sets = (items || []).filter((i) => i.component && !i.component.allow_backorder).map((i) => Math.floor((i.component!.stock || 0) / i.quantity));
  const available = sets.length ? Math.max(0, Math.min(...sets)) : null;
  const shown = query.trim().length >= 2 ? matches : [];

  return (
    <div className="space-y-4">
      <DashAlert message={error} />
      {items === null ? (
        <p className="text-sm text-slate-600" role="status">
          Loading…
        </p>
      ) : items.length === 0 ? (
        <p className="text-sm text-slate-600">Nothing in this bundle yet. Search below to add the products it contains.</p>
      ) : (
        <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
          {items.map((item) => (
            <li key={item.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-slate-900">{item.component?.name ?? "Product removed"}</p>
                <p className="text-xs text-slate-500">
                  {item.component ? `${money(Number(item.component.price) || 0)} each · ${item.component.allow_backorder ? "can be ordered when out of stock" : `${item.component.stock} in stock`}` : ""}
                </p>
              </div>
              <div className="flex items-center gap-1" role="group" aria-label={`How many ${item.component?.name ?? "items"} in each bundle`}>
                <button type="button" className={`rounded-lg border border-slate-300 p-1.5 disabled:opacity-40 ${focusRing}`} disabled={busy || item.quantity <= 1} onClick={() => setQty(item, item.quantity - 1)} aria-label="One fewer">
                  <Minus className="h-4 w-4" aria-hidden />
                </button>
                <span className="w-8 text-center text-sm font-semibold" aria-live="polite">
                  {item.quantity}
                </span>
                <button type="button" className={`rounded-lg border border-slate-300 p-1.5 disabled:opacity-40 ${focusRing}`} disabled={busy || item.quantity >= 100} onClick={() => setQty(item, item.quantity + 1)} aria-label="One more">
                  <Plus className="h-4 w-4" aria-hidden />
                </button>
              </div>
              <button type="button" className={`${dashButton.danger} ${focusRing}`} disabled={busy} onClick={() => remove(item)}>
                <Trash2 className="h-4 w-4" aria-hidden /> Remove<span className="sr-only"> {item.component?.name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {items && items.length ? (
        <div className="grid gap-2 rounded-xl bg-teal-50 p-4 text-sm text-slate-700 sm:grid-cols-2">
          <p>
            <span className="block font-semibold text-slate-900">{available === null ? "No limit" : `${available} ready to sell`}</span>
            Worked out from the items&rsquo; stock. Selling a bundle takes each item out of stock.
          </p>
          <p>
            <span className="block font-semibold text-slate-900">{money(separately)} if bought separately</span>
            {price > 0 && separately > price ? `Shoppers save ${money(separately - price)} with the bundle.` : "Set the bundle's price below this to show shoppers a saving."}
          </p>
        </div>
      ) : null}

      <div>
        <label htmlFor="bundle-search" className="mb-1 block text-sm font-medium text-slate-800">
          Add a product to the bundle
        </label>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
          <input
            id="bundle-search"
            className={`${dashInput} pl-9`}
            placeholder="Search by name or stock code"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoComplete="off"
          />
        </div>
        {shown.length ? (
          <ul className="mt-2 divide-y divide-slate-100 rounded-xl border border-slate-200" aria-label="Matching products">
            {shown.map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <span className="min-w-0 truncate text-sm text-slate-800">
                  {m.name} <span className="text-slate-500">· {money(Number(m.sellingPrice ?? m.price) || 0)}</span>
                </span>
                <button type="button" className={`${dashButton.quiet} ${focusRing}`} disabled={busy} onClick={() => add(m)}>
                  <Plus className="h-4 w-4" aria-hidden /> Add<span className="sr-only"> {m.name}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        <p className="mt-1 text-xs text-slate-500">Products with sizes or colours, and other bundles, can&rsquo;t go in a bundle.</p>
      </div>
    </div>
  );
}

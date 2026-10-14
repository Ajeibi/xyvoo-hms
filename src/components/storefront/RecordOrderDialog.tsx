"use client";

import { useEffect, useId, useState } from "react";
import { Minus, Plus, Search, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatShopCurrency } from "@/lib/shop/format";
import type { DashboardProduct } from "@/lib/store/products";
import { CHANNEL_LABELS, MANUAL_CHANNELS, MANUAL_PAYMENT_METHODS, PAYMENT_LABELS, manualOrderTotal, type ManualChannel, type ManualPaymentMethod } from "@/lib/store/manual-orders";
import BarcodeScanner from "./BarcodeScanner";
import { MEANING } from "./meaning";
import { DashAlert, dashButton, DashField, dashInput, sendJson } from "./dashboard-ui";

type Line = {
  key: string;
  productId: string;
  name: string;
  variantId: string | null;
  variants: { id: string; label: string; price: number | null; stock: number }[];
  basePrice: number;
  unitPrice: string;
  quantity: number;
  stock: number;
  allowBackorder: boolean;
};

const focusRing = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-xyvoo-blue focus-visible:ring-offset-2";
const pill = (on: boolean) =>
  `inline-flex items-center rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors ${on ? MEANING.orders.chipOn : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"} ${focusRing}`;

/**
 * Dashboard → Orders → "Record an order": a sale made in person, on the phone,
 * on WhatsApp or on social media. Stock comes off and it counts in your sales.
 */
export default function RecordOrderDialog({
  slug,
  currency,
  open,
  onOpenChange,
  onRecorded,
}: {
  slug: string;
  currency: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRecorded: (orderId: string) => void;
}) {
  const id = useId();
  const money = (n: number) => formatShopCurrency(n, currency);
  const [channel, setChannel] = useState<ManualChannel>("in_person");
  const [lines, setLines] = useState<Line[]>([]);
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<DashboardProduct[]>([]);
  const [customer, setCustomer] = useState({ name: "", phone: "", email: "" });
  const [payment, setPayment] = useState<ManualPaymentMethod>("Cash");
  const [collected, setCollected] = useState(true);
  const [delivery, setDelivery] = useState({ fee: "", method: "", address: "" });
  const [discount, setDiscount] = useState("");
  const [note, setNote] = useState("");
  const [emailReceipt, setEmailReceipt] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Start fresh each time it opens.
  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => {
      setChannel("in_person");
      setLines([]);
      setQuery("");
      setMatches([]);
      setCustomer({ name: "", phone: "", email: "" });
      setPayment("Cash");
      setCollected(true);
      setDelivery({ fee: "", method: "", address: "" });
      setDiscount("");
      setNote("");
      setEmailReceipt(true);
      setError("");
    }, 0);
    return () => window.clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) return;
    const timer = window.setTimeout(() => {
      fetch(`/api/store/products/list?slug=${encodeURIComponent(slug)}&page=1&q=${encodeURIComponent(term)}`)
        .then((res) => res.json())
        .then((body) => setMatches(((body.products || []) as DashboardProduct[]).filter((p) => p.status !== "archived").slice(0, 6)))
        .catch(() => setMatches([]));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [query, slug]);

  const addProduct = (p: DashboardProduct, preferVariantId?: string) => {
    const variants = (p.variants || []).map((v) => ({
      id: v.id,
      label: Object.values(v.options || {}).join(" · ") || "Option",
      price: v.price_override,
      stock: v.stock,
    }));
    const first = variants.find((v) => v.id === preferVariantId) ?? variants[0];
    const price = first?.price ?? p.sellingPrice;
    setLines((list) => [
      ...list,
      {
        key: `${p.id}-${Date.now()}`,
        productId: p.id,
        name: p.name,
        variantId: first?.id ?? null,
        variants,
        basePrice: p.sellingPrice,
        unitPrice: String(price),
        quantity: 1,
        stock: first ? first.stock : p.stock,
        allowBackorder: p.allowBackorder,
      },
    ]);
    setQuery("");
    setMatches([]);
  };
  const [scanMessage, setScanMessage] = useState("");

  /** A barcode (typed, from a handheld scanner, or read by the camera): adds the product, and the right option, straight away. */
  const scan = async (raw: string) => {
    const code = raw.trim();
    if (code.length < 3) return;
    setScanMessage("");
    try {
      const res = await fetch(`/api/store/products/list?slug=${encodeURIComponent(slug)}&page=1&q=${encodeURIComponent(code)}`);
      const body = await res.json().catch(() => ({}));
      const found = ((body.products || []) as DashboardProduct[]).filter((p) => p.status !== "archived");
      const lower = code.toLowerCase();
      for (const p of found) {
        const variant = (p.variants || []).find((v) => [v.barcode, v.sku].some((x) => x && x.toLowerCase() === lower));
        if (variant || [p.barcode, p.gtin, p.sku].some((x) => x && x.toLowerCase() === lower)) {
          addProduct(p, variant?.id);
          setScanMessage(`Added ${p.name}.`);
          return;
        }
      }
      if (found.length === 1) {
        addProduct(found[0]);
        setScanMessage(`Added ${found[0].name}.`);
      } else if (found.length > 1) setMatches(found.slice(0, 6));
      else setScanMessage(`Nothing in your shop matches “${code}”.`);
    } catch {
      setScanMessage("We couldn't look that up. Please try again.");
    }
  };

  const update = (key: string, patch: Partial<Line>) => setLines((list) => list.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const num = (s: string) => Number(s.replace(/[^0-9.]/g, "")) || 0;
  const totals = manualOrderTotal(
    lines.map((l) => ({ unitPrice: num(l.unitPrice), quantity: l.quantity })),
    num(discount),
    collected ? 0 : num(delivery.fee),
  );
  const paid = payment !== "Pay later";
  const shortOf = lines.find((l) => !l.allowBackorder && l.quantity > l.stock);

  const save = async () => {
    if (!lines.length) return setError("Add at least one product.");
    if (shortOf) return setError(`There ${shortOf.stock === 1 ? "is" : "are"} only ${Math.max(shortOf.stock, 0)} of ${shortOf.name} in stock.`);
    setSaving(true);
    setError("");
    try {
      const data = await sendJson("/api/store/orders/manual", "POST", {
        slug,
        channel,
        customer: { name: customer.name || undefined, phone: customer.phone || undefined, email: customer.email || undefined },
        items: lines.map((l) => ({ productId: l.productId, variantId: l.variantId, quantity: l.quantity, unitPrice: num(l.unitPrice) })),
        paymentMethod: payment,
        collected,
        deliveryFee: collected ? 0 : num(delivery.fee),
        deliveryMethod: collected ? undefined : delivery.method || undefined,
        address: collected ? undefined : delivery.address || undefined,
        discount: num(discount),
        note: note || undefined,
        emailReceipt: Boolean(emailReceipt && customer.email && paid),
      });
      onRecorded(String(data.orderId));
      onOpenChange(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[100dvh] max-h-[100dvh] w-full max-w-none flex-col gap-0 overflow-hidden rounded-none border-0 p-0 motion-reduce:animate-none sm:h-auto sm:max-h-[90vh] sm:max-w-2xl sm:rounded-[24px] sm:border">
        <DialogHeader className="shrink-0 border-b border-slate-200 px-5 pb-4 pt-5 text-left sm:px-6">
          <DialogTitle>Record an order</DialogTitle>
          <DialogDescription className="text-slate-600">
            For a sale in person, on the phone, on WhatsApp or on social media. Stock comes off straight away and it counts in your sales.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-5 sm:px-6">
          <fieldset>
            <legend className="mb-2 text-sm font-semibold text-slate-900">Where was it sold?</legend>
            <div className="flex flex-wrap gap-2">
              {MANUAL_CHANNELS.map((c) => (
                <button key={c} type="button" className={pill(channel === c)} aria-pressed={channel === c} onClick={() => setChannel(c)}>
                  {CHANNEL_LABELS[c]}
                </button>
              ))}
            </div>
          </fieldset>

          <section aria-labelledby={`${id}-items`} className="space-y-3">
            <h3 id={`${id}-items`} className="text-sm font-semibold text-slate-900">
              What did they buy?
            </h3>
            {lines.length ? (
              <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
                {lines.map((l) => (
                  <li key={l.key} className="space-y-3 px-4 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <p className="min-w-0 text-sm font-medium text-slate-900">{l.name}</p>
                      <button type="button" className={`${dashButton.danger} ${focusRing}`} onClick={() => setLines((list) => list.filter((x) => x.key !== l.key))}>
                        <Trash2 className="h-4 w-4" aria-hidden /> Remove<span className="sr-only"> {l.name}</span>
                      </button>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-3">
                      {l.variants.length ? (
                        <DashField id={`${l.key}-variant`} label="Option">
                          <select
                            id={`${l.key}-variant`}
                            className={dashInput}
                            value={l.variantId ?? ""}
                            onChange={(e) => {
                              const v = l.variants.find((x) => x.id === e.target.value);
                              update(l.key, { variantId: v?.id ?? null, stock: v?.stock ?? 0, unitPrice: String(v?.price ?? l.basePrice) });
                            }}
                          >
                            {l.variants.map((v) => (
                              <option key={v.id} value={v.id}>
                                {v.label} ({v.stock} in stock)
                              </option>
                            ))}
                          </select>
                        </DashField>
                      ) : null}
                      <div>
                        <span className="mb-1 block text-sm font-medium text-slate-800" id={`${l.key}-qty-label`}>
                          Quantity
                        </span>
                        <div className="flex items-center gap-1" role="group" aria-labelledby={`${l.key}-qty-label`}>
                          <button type="button" className={`rounded-lg border border-slate-300 p-2 disabled:opacity-40 ${focusRing}`} disabled={l.quantity <= 1} onClick={() => update(l.key, { quantity: l.quantity - 1 })} aria-label="One fewer">
                            <Minus className="h-4 w-4" aria-hidden />
                          </button>
                          <span className="w-10 text-center text-sm font-semibold" aria-live="polite">
                            {l.quantity}
                          </span>
                          <button type="button" className={`rounded-lg border border-slate-300 p-2 ${focusRing}`} onClick={() => update(l.key, { quantity: l.quantity + 1 })} aria-label="One more">
                            <Plus className="h-4 w-4" aria-hidden />
                          </button>
                        </div>
                        {!l.allowBackorder ? <p className={`mt-1 text-xs ${l.quantity > l.stock ? "text-red-700" : "text-slate-500"}`}>{Math.max(l.stock, 0)} in stock</p> : null}
                      </div>
                      <DashField id={`${l.key}-price`} label="Price each" hint="Change it if you agreed a different price.">
                        <input id={`${l.key}-price`} className={dashInput} inputMode="decimal" value={l.unitPrice} onChange={(e) => update(l.key, { unitPrice: e.target.value })} aria-describedby={`${l.key}-price-hint`} />
                      </DashField>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-slate-600">Search for a product to add it.</p>
            )}
            <div>
              <label htmlFor={`${id}-search`} className="sr-only">
                Find a product
              </label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
                <input id={`${id}-search`} className={`${dashInput} pl-9`} placeholder="Name, stock code or barcode" value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void scan(query); } }} autoComplete="off" aria-describedby={`${id}-scan`} />
              </div>
              <p id={`${id}-scan`} className="mt-1 text-xs text-slate-600" role="status">
                {scanMessage || "Using a barcode scanner? Scan, and the product is added."}
              </p>
              <div className="mt-2">
                <BarcodeScanner onScan={(code) => { setQuery(code); void scan(code); }} />
              </div>
              {query.trim().length >= 2 && matches.length ? (
                <ul className="mt-2 divide-y divide-slate-100 rounded-xl border border-slate-200" aria-label="Matching products">
                  {matches.map((m) => (
                    <li key={m.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                      <span className="min-w-0 truncate text-sm text-slate-800">
                        {m.name} <span className="text-slate-500">· {money(m.sellingPrice)}</span>
                      </span>
                      <button type="button" className={`${dashButton.quiet} ${focusRing}`} onClick={() => addProduct(m)}>
                        <Plus className="h-4 w-4" aria-hidden /> Add<span className="sr-only"> {m.name}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          </section>

          <fieldset className="space-y-3">
            <legend className="text-sm font-semibold text-slate-900">
              Customer <span className="font-normal text-slate-500">(optional)</span>
            </legend>
            <div className="grid gap-3 sm:grid-cols-3">
              <DashField id={`${id}-name`} label="Name">
                <input id={`${id}-name`} className={dashInput} value={customer.name} onChange={(e) => setCustomer({ ...customer, name: e.target.value })} maxLength={120} autoComplete="off" />
              </DashField>
              <DashField id={`${id}-phone`} label="Phone">
                <input id={`${id}-phone`} type="tel" className={dashInput} value={customer.phone} onChange={(e) => setCustomer({ ...customer, phone: e.target.value })} maxLength={40} autoComplete="off" />
              </DashField>
              <DashField id={`${id}-email`} label="Email">
                <input id={`${id}-email`} type="email" className={dashInput} value={customer.email} onChange={(e) => setCustomer({ ...customer, email: e.target.value })} maxLength={200} autoComplete="off" />
              </DashField>
            </div>
            <p className="text-xs text-slate-500">With a name and phone or email, they appear in your Customers list with this order.</p>
          </fieldset>

          <fieldset>
            <legend className="mb-2 text-sm font-semibold text-slate-900">How did they pay?</legend>
            <div className="flex flex-wrap gap-2">
              {MANUAL_PAYMENT_METHODS.map((m) => (
                <button key={m} type="button" className={pill(payment === m)} aria-pressed={payment === m} onClick={() => setPayment(m)}>
                  {PAYMENT_LABELS[m]}
                </button>
              ))}
            </div>
            {!paid ? <p className="mt-2 text-xs text-slate-600">Mark it as paid from the order when the money arrives.</p> : null}
          </fieldset>

          <fieldset className="space-y-3">
            <legend className="mb-2 text-sm font-semibold text-slate-900">Have they got it?</legend>
            <div className="flex flex-wrap gap-2">
              <button type="button" className={pill(collected)} aria-pressed={collected} onClick={() => setCollected(true)}>
                Yes, they took it with them
              </button>
              <button type="button" className={pill(!collected)} aria-pressed={!collected} onClick={() => setCollected(false)}>
                No, it needs sending
              </button>
            </div>
            {!collected ? (
              <div className="grid gap-3 sm:grid-cols-3">
                <DashField id={`${id}-method`} label="How it's going" optional>
                  <input id={`${id}-method`} className={dashInput} placeholder="e.g. Dispatch rider" value={delivery.method} onChange={(e) => setDelivery({ ...delivery, method: e.target.value })} maxLength={120} />
                </DashField>
                <DashField id={`${id}-fee`} label="Delivery charge" optional>
                  <input id={`${id}-fee`} className={dashInput} inputMode="decimal" value={delivery.fee} onChange={(e) => setDelivery({ ...delivery, fee: e.target.value })} />
                </DashField>
                <DashField id={`${id}-address`} label="Address" optional>
                  <input id={`${id}-address`} className={dashInput} value={delivery.address} onChange={(e) => setDelivery({ ...delivery, address: e.target.value })} maxLength={400} />
                </DashField>
              </div>
            ) : null}
          </fieldset>

          <div className="grid gap-3 sm:grid-cols-2">
            <DashField id={`${id}-discount`} label="Money off" optional>
              <input id={`${id}-discount`} className={dashInput} inputMode="decimal" value={discount} onChange={(e) => setDiscount(e.target.value)} />
            </DashField>
            <DashField id={`${id}-note`} label="Note for your team" optional>
              <input id={`${id}-note`} className={dashInput} value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} placeholder="Only you and your team see this" />
            </DashField>
          </div>

          {customer.email && paid ? (
            <label className="flex items-start gap-3 text-sm text-slate-800">
              <input type="checkbox" className="mt-0.5 h-4 w-4 accent-sky-600" checked={emailReceipt} onChange={(e) => setEmailReceipt(e.target.checked)} />
              Email the receipt to {customer.email}
            </label>
          ) : null}

          <dl className="grid grid-cols-2 gap-y-1 rounded-xl bg-sky-50 p-4 text-sm">
            <dt className="text-slate-600">Items</dt>
            <dd className="text-right text-slate-900">{money(totals.subtotal)}</dd>
            {totals.discount > 0 ? (
              <>
                <dt className="text-slate-600">Money off</dt>
                <dd className="text-right text-slate-900">−{money(totals.discount)}</dd>
              </>
            ) : null}
            {!collected && num(delivery.fee) > 0 ? (
              <>
                <dt className="text-slate-600">Delivery</dt>
                <dd className="text-right text-slate-900">{money(num(delivery.fee))}</dd>
              </>
            ) : null}
            <dt className="font-semibold text-slate-900">Total</dt>
            <dd className="text-right font-semibold text-slate-900">{money(totals.total)}</dd>
          </dl>
          <DashAlert message={error} />
        </div>

        <DialogFooter className="shrink-0 border-t border-slate-200 px-5 py-4 sm:px-6">
          <button type="button" className={`${dashButton.secondary} ${focusRing}`} onClick={() => onOpenChange(false)}>
            Cancel
          </button>
          <button type="button" className={`${dashButton.primary} ${focusRing}`} onClick={save} disabled={saving || !lines.length}>
            {saving ? "Recording…" : `Record ${money(totals.total)} order`}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

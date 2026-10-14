"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Printer } from "lucide-react";
import { formatShopCurrency } from "@/lib/shop/format";
import { barcodeBars } from "@/lib/store/barcode";
import { DashAlert, dashButton, DashCard, DashEmptyState, DashField, dashInput } from "./dashboard-ui";

const focusRing = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-xyvoo-blue focus-visible:ring-offset-2";

type Label = { key: string; name: string; option: string | null; barcode: string; price: number };

/** The bars as an SVG: black on white, with the number underneath, and a quiet zone either side so scanners can read it. */
function BarcodeSvg({ code }: { code: string }) {
  const bars = barcodeBars(code);
  if (!bars) return <p className="text-xs text-red-700">This barcode can&rsquo;t be drawn.</p>;
  const quiet = 10;
  const total = bars.widths.reduce((s, n) => s + n, 0) + quiet * 2;
  // Where each bar starts: the quiet zone plus the widths before it.
  const starts = bars.widths.map((_, i) => quiet + bars.widths.slice(0, i).reduce((s, n) => s + n, 0));
  const rects = bars.widths.map((w, i) => (i % 2 === 0 ? <rect key={i} x={starts[i]} y={0} width={w} height={50} fill="#000" /> : null));
  return (
    <svg viewBox={`0 0 ${total} 62`} role="img" aria-label={`Barcode ${bars.text}`} className="h-14 w-full" preserveAspectRatio="xMidYMid meet">
      <rect width={total} height={62} fill="#fff" />
      {rects}
      <text x={total / 2} y={60} textAnchor="middle" fontSize={9} fontFamily="monospace" fill="#000">
        {bars.text}
      </text>
    </svg>
  );
}

/** Dashboard → Products → Barcode labels: pick products, say how many labels of each, and print. */
export default function BarcodeLabels({ slug }: { slug: string }) {
  const [labels, setLabels] = useState<Label[] | null>(null);
  const [currency, setCurrency] = useState("NGN");
  const [error, setError] = useState("");
  const [copies, setCopies] = useState<Record<string, number>>({});
  const [showPrice, setShowPrice] = useState(true);

  useEffect(() => {
    fetch(`/api/store/products/barcodes?slug=${encodeURIComponent(slug)}`)
      .then(async (res) => ({ ok: res.ok, body: await res.json().catch(() => ({})) }))
      .then(({ ok, body }) => {
        if (!ok) return setError(typeof body.error === "string" ? body.error : "We couldn't load your products.");
        setLabels(body.labels);
        setCurrency(body.currency);
      })
      .catch(() => setError("We couldn't load your products. Please refresh the page."));
  }, [slug]);

  const sheet = useMemo(() => (labels ?? []).flatMap((l) => Array.from({ length: copies[l.key] ?? 0 }, (_, i) => ({ ...l, n: i }))), [labels, copies]);

  if (!labels) {
    return error ? (
      <DashAlert message={error} />
    ) : (
      <p className="text-sm text-slate-600" role="status">
        Loading your products…
      </p>
    );
  }

  if (labels.length === 0) {
    return (
      <DashEmptyState
        art="tag"
        meaning="stock"
        title="No barcodes saved yet"
        description={
          <>
            Add a barcode to a product (or to one of its options) when you edit it in{" "}
            <Link href={`/storefront/${slug}/products`} className={`rounded font-medium text-blue-800 underline ${focusRing}`}>
              Products
            </Link>
            , then come back here to print labels.
          </>
        }
      />
    );
  }

  const total = sheet.length;

  return (
    <div className="space-y-6">
      {/* Printing shows only the labels, not the dashboard around them. */}
      <style>{`@media print { body * { visibility: hidden !important; } #label-sheet, #label-sheet * { visibility: visible !important; } #label-sheet { position: absolute; left: 0; top: 0; width: 100%; } }`}</style>
      <div className="print:hidden">
        <DashCard id="label-choose" icon={Printer} title="Choose your labels" description="Set how many labels you want of each. Leave it at 0 to skip one.">
          <div className="space-y-4">
            <DashAlert message={error} />
            <ul className="divide-y divide-slate-100">
              {labels.map((l) => (
                <li key={l.key} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="break-words font-medium text-slate-900">
                      {l.name}
                      {l.option ? <span className="font-normal text-slate-600"> · {l.option}</span> : null}
                    </p>
                    <p className="text-sm text-slate-600">{l.barcode}</p>
                  </div>
                  <div className="w-28">
                    <DashField id={`copies-${l.key}`} label="Labels">
                      <input id={`copies-${l.key}`} className={dashInput} type="number" inputMode="numeric" min={0} max={200} step={1} value={copies[l.key] ?? 0} onChange={(e) => setCopies({ ...copies, [l.key]: Math.max(0, Math.min(200, Math.floor(Number(e.target.value) || 0))) })} />
                    </DashField>
                  </div>
                </li>
              ))}
            </ul>
            <label className="flex items-center gap-3 text-sm text-slate-800">
              <input type="checkbox" checked={showPrice} onChange={(e) => setShowPrice(e.target.checked)} className="h-4 w-4 accent-blue-600" />
              Show the price on each label
            </label>
            <div className="flex flex-wrap items-center gap-3">
              <button type="button" onClick={() => window.print()} disabled={total === 0} className={`${dashButton.primary} ${focusRing}`}>
                <Printer className="h-4 w-4" aria-hidden /> Print {total} {total === 1 ? "label" : "labels"}
              </button>
              <button type="button" onClick={() => setCopies(Object.fromEntries(labels.map((l) => [l.key, 1])))} className={`${dashButton.secondary} ${focusRing}`}>
                One of each
              </button>
              <button type="button" onClick={() => setCopies({})} className={`${dashButton.quiet} ${focusRing}`}>
                Clear
              </button>
            </div>
            <p className="text-sm text-slate-600">Print at 100% size (not &ldquo;fit to page&rdquo;) and try one label with your scanner before printing a whole sheet.</p>
          </div>
        </DashCard>
      </div>

      {total > 0 ? (
        <section id="label-sheet" aria-label="Labels to print" className="grid grid-cols-2 gap-2 sm:grid-cols-3 print:grid-cols-3 print:gap-1">
          {sheet.map((l) => (
            <div key={`${l.key}-${l.n}`} className="break-inside-avoid rounded-lg border border-slate-300 bg-white p-2 text-center print:rounded-none print:border-slate-400">
              <p className="line-clamp-2 text-xs font-medium text-black">
                {l.name}
                {l.option ? ` · ${l.option}` : ""}
              </p>
              <BarcodeSvg code={l.barcode} />
              {showPrice ? <p className="text-sm font-semibold text-black">{formatShopCurrency(l.price, currency)}</p> : null}
            </div>
          ))}
        </section>
      ) : null}
    </div>
  );
}

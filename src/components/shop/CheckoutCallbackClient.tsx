"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { CheckCircle2, CircleAlert, Loader2 } from "lucide-react";
import { useCartStore } from "@/components/shop/CartProvider";
import { formatShopCurrency } from "@/lib/shop/format";

type OrderSummary = {
  id: string;
  customer_name: string;
  total_amount: number;
  order_items: Array<{ product_name: string; quantity: number; unit_price: number; line_total: number }>;
};

type VerifyResult = { status: string; order: OrderSummary | null };

export default function CheckoutCallbackClient({ slug, reference }: { slug: string; reference: string }) {
  const clearCart = useCartStore((s) => s.clear);
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [error, setError] = useState("");
  const calledRef = useRef(false);

  useEffect(() => {
    if (!reference || calledRef.current) return;
    calledRef.current = true;

    fetch(`/api/shop/${encodeURIComponent(slug)}/checkout/verify?reference=${encodeURIComponent(reference)}`)
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Failed to verify payment.");
        setResult(data);
        if (data.status === "success") clearCart();
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Something went wrong."));
  }, [slug, reference, clearCart]);

  if (!reference) {
    return <p className="text-center text-sm text-slate-500">Missing payment reference.</p>;
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center">
        <CircleAlert className="mx-auto h-8 w-8 text-red-500" />
        <p className="mt-3 text-sm text-red-800">{error}</p>
      </div>
    );
  }

  if (!result) {
    return (
      <div className="flex flex-col items-center gap-3 py-16">
        <Loader2 className="h-6 w-6 animate-spin text-xyvoo-blue" />
        <p className="text-sm text-slate-500">Confirming your payment…</p>
      </div>
    );
  }

  if (result.status !== "success") {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-center">
        <CircleAlert className="mx-auto h-8 w-8 text-amber-500" />
        <p className="mt-3 text-sm font-medium text-amber-900">
          {result.status === "pending" ? "Your payment is still processing." : "Your payment wasn't completed."}
        </p>
        <Link href={`/shop/${slug}/checkout`} className="mt-4 inline-block text-sm font-medium text-xyvoo-blue hover:underline">
          Try again →
        </Link>
      </div>
    );
  }

  const order = result.order;

  return (
    <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-center">
      <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-600" />
      <p className="mt-3 text-base font-semibold text-emerald-900">Payment successful — thank you!</p>
      {order ? (
        <div className="mt-5 rounded-xl bg-white p-4 text-left">
          <p className="text-xs text-slate-500">Order #{order.id.slice(0, 8).toUpperCase()}</p>
          <ul className="mt-2 space-y-1">
            {order.order_items.map((item, i) => (
              <li key={i} className="flex justify-between text-sm text-slate-700">
                <span>
                  {item.product_name} × {item.quantity}
                </span>
                <span>{formatShopCurrency(item.line_total, null)}</span>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex justify-between border-t border-slate-100 pt-3 text-sm font-semibold text-slate-900">
            <span>Total</span>
            <span>{formatShopCurrency(order.total_amount, null)}</span>
          </div>
        </div>
      ) : null}
      <Link href={`/shop/${slug}`} className="mt-5 inline-block text-sm font-medium text-xyvoo-blue hover:underline">
        Continue shopping →
      </Link>
    </div>
  );
}

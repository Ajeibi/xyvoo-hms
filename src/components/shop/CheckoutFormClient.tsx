"use client";

import { useState } from "react";
import Link from "next/link";
import { CircleAlert } from "lucide-react";
import { useCartStore } from "@/components/shop/CartProvider";
import { calculateCartTotals } from "@/lib/shop/cart";
import { formatShopCurrency } from "@/lib/shop/format";
import { toastError } from "@/lib/app-toast";

type FormState = {
  name: string;
  email: string;
  phone: string;
  line1: string;
  line2: string;
  city: string;
  state: string;
  country: string;
  postalCode: string;
};

const EMPTY_FORM: FormState = {
  name: "",
  email: "",
  phone: "",
  line1: "",
  line2: "",
  city: "",
  state: "",
  country: "",
  postalCode: "",
};

export default function CheckoutFormClient({ slug }: { slug: string }) {
  const lines = useCartStore((s) => s.lines);
  const hasHydrated = useCartStore((s) => s.hasHydrated);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const { subtotal, currency } = calculateCartTotals(lines);

  const field = (key: keyof FormState) => ({
    value: form[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setForm((prev) => ({ ...prev, [key]: e.target.value })),
  });

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch(`/api/shop/${encodeURIComponent(slug)}/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer: { name: form.name, email: form.email, phone: form.phone || undefined },
          shippingAddress: {
            line1: form.line1 || undefined,
            line2: form.line2 || undefined,
            city: form.city || undefined,
            state: form.state || undefined,
            country: form.country || undefined,
            postalCode: form.postalCode || undefined,
          },
          items: lines.map((l) => ({ productId: l.productId, variantId: l.variantId, quantity: l.quantity })),
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        const message = typeof data.error === "string" ? data.error : "Failed to start checkout.";
        setError(message);
        toastError("Checkout failed", message);
        return;
      }

      // The cart is intentionally left as-is until payment is confirmed on
      // the callback page -- if the shopper abandons Paystack and comes
      // back, their cart (and the option to retry) is still there.
      window.location.href = data.authorizationUrl;
    } catch {
      const message = "We couldn't reach the server. Check your connection and try again.";
      setError(message);
      toastError("Connection problem", message);
    } finally {
      setLoading(false);
    }
  };

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
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1.4fr_1fr]">
      <form onSubmit={handleSubmit} className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Contact details</p>
        <input
          className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm"
          placeholder="Full name"
          autoComplete="name"
          required
          {...field("name")}
        />
        <input
          className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm"
          type="email"
          placeholder="Email address"
          autoComplete="email"
          required
          {...field("email")}
        />
        <input
          className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm"
          type="tel"
          placeholder="Phone number"
          autoComplete="tel"
          {...field("phone")}
        />

        <p className="pt-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Shipping address</p>
        <input
          className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm"
          placeholder="Address line 1"
          autoComplete="address-line1"
          {...field("line1")}
        />
        <input
          className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm"
          placeholder="Address line 2 (optional)"
          autoComplete="address-line2"
          {...field("line2")}
        />
        <div className="grid grid-cols-2 gap-3">
          <input
            className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm"
            placeholder="City"
            autoComplete="address-level2"
            {...field("city")}
          />
          <input
            className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm"
            placeholder="State"
            autoComplete="address-level1"
            {...field("state")}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <input
            className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm"
            placeholder="Country"
            autoComplete="country-name"
            {...field("country")}
          />
          <input
            className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm"
            placeholder="Postal code"
            autoComplete="postal-code"
            {...field("postalCode")}
          />
        </div>

        {error ? (
          <div role="alert" className="flex gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-red-600" aria-hidden />
            <p>{error}</p>
          </div>
        ) : null}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-xl bg-xyvoo-blue py-3 text-sm font-semibold text-white disabled:opacity-60"
        >
          {loading ? "Redirecting to payment…" : "Pay now"}
        </button>
      </form>

      <div className="h-fit rounded-2xl border border-slate-200 p-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Order summary</p>
        <ul className="mt-3 space-y-2">
          {lines.map((line) => (
            <li key={`${line.productId}:${line.variantId || ""}`} className="flex justify-between text-sm">
              <span className="text-slate-600">
                {line.name} × {line.quantity}
              </span>
              <span className="font-medium text-slate-900">
                {formatShopCurrency(line.unitPrice * line.quantity, line.currency)}
              </span>
            </li>
          ))}
        </ul>
        <div className="mt-4 flex justify-between border-t border-slate-100 pt-4 text-sm font-semibold text-slate-900">
          <span>Total</span>
          <span>{formatShopCurrency(subtotal, currency)}</span>
        </div>
      </div>
    </div>
  );
}

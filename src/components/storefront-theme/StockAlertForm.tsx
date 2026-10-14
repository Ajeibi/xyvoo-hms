"use client";

import { useId, useState } from "react";
import { useStorefront } from "./StorefrontProvider";
import { useShopAccount } from "./useShopAccount";

/**
 * "Email me when it's back" on a sold-out product (or size or colour). Signed-in
 * shoppers just press the button; guests type their email. One email, once.
 */
export default function StockAlertForm({ productId, variantId, label }: { productId: string; variantId: string | null; label: string }) {
  const { slug } = useStorefront();
  const { account } = useShopAccount();
  const id = useId();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  // Done per product and size, so choosing another size offers the button again.
  const [doneFor, setDoneFor] = useState<string | null>(null);
  const key = `${productId}:${variantId ?? ""}`;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const typed = email.trim();
    if (!account && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(typed)) return setStatus("Enter an email address in the format name@example.com.");
    setBusy(true);
    setStatus("");
    try {
      const res = await fetch(`/api/shop/${encodeURIComponent(slug)}/stock-alerts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId, variantId, email: account ? undefined : typed }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "We couldn't save that. Please try again.");
      setDoneFor(key);
      setStatus(`Done. We'll email ${data.email} when ${label} is back in stock.`);
    } catch (err) {
      setStatus(err instanceof TypeError ? "We couldn't connect. Check your internet connection and try again." : (err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="stock-alert" onSubmit={submit} noValidate aria-labelledby={`${id}-title`}>
      <p className="stock-alert__title" id={`${id}-title`}>
        Sold out for now
      </p>
      {doneFor === key ? null : (
        <>
          <p className="stock-alert__text">Want it? We&rsquo;ll send you one email as soon as it&rsquo;s back.</p>
          {account ? null : (
            <div className="field">
              <label htmlFor={`${id}-email`}>Your email address</label>
              <input className="input" id={`${id}-email`} type="email" inputMode="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
          )}
          <button className="btn btn--outline" type="submit" disabled={busy}>
            {busy ? "Saving…" : "Email me when it’s back"}
          </button>
        </>
      )}
      <p className="form-status" role="status">
        {doneFor === null || doneFor === key ? status : ""}
      </p>
    </form>
  );
}

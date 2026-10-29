"use client";

import { useState } from "react";
import { formatShopCurrency } from "@/lib/shop/format";
import type { SimulatedOutcome } from "@/lib/payments/simulated";
import { useStorefront, useT } from "./StorefrontProvider";

/** The pretend card page: choose what the bank would have said. For testing only. */
export default function SimulatedPayment({ reference, amount, currency, storeName }: { reference: string; amount: number; currency: string; storeName: string }) {
  const { slug, href } = useStorefront();
  const t = useT();
  const [busy, setBusy] = useState<SimulatedOutcome | null>(null);
  const [error, setError] = useState("");

  const choose = async (outcome: SimulatedOutcome) => {
    setBusy(outcome);
    setError("");
    try {
      const res = await fetch(`/api/shop/${encodeURIComponent(slug)}/checkout/simulate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reference, outcome }),
      });
      if (!res.ok) throw new Error();
      window.location.assign(`${href("/checkout/callback")}?reference=${encodeURIComponent(reference)}`);
    } catch {
      setError(t("checkout.testPaymentFailed"));
      setBusy(null);
    }
  };

  return (
    <div className="cart-empty">
      <h1 className="h-page">{t("checkout.testPayment")}</h1>
      <p className="body-copy">
        {t("checkout.testPaymentIntro", { amount: formatShopCurrency(amount, currency), store: storeName })}
      </p>
      <div className="account-form__actions">
        <button type="button" className="btn btn--primary" disabled={busy !== null} onClick={() => choose("success")}>
          {busy === "success" ? t("checkout.paying") : t("checkout.paySuccessfully")}
        </button>
        <button type="button" className="btn btn--outline" disabled={busy !== null} onClick={() => choose("failed")}>
          {t("checkout.cardDeclined")}
        </button>
        <button type="button" className="link-button" disabled={busy !== null} onClick={() => choose("abandoned")}>
          {t("checkout.leaveWithoutPaying")}
        </button>
      </div>
      <p className="form-status" role="status">
        {error}
      </p>
    </div>
  );
}

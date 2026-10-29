"use client";

import { useId, useState } from "react";
import { useStorefront, useT } from "./StorefrontProvider";
import { Icon } from "./primitives";

/**
 * On the "order received" page for a bank transfer: send the shop a screenshot
 * or PDF of the transfer, so they can match it to the order sooner.
 */
export default function PaymentProofUpload({ orderId, storeName, alreadySent }: { orderId: string; storeName: string; alreadySent: boolean }) {
  const { slug } = useStorefront();
  const t = useT();
  const id = useId();
  const [sent, setSent] = useState(alreadySent);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [invalid, setInvalid] = useState(false);

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const file = new FormData(e.currentTarget).get("file");
    if (!(file instanceof File) || file.size === 0) {
      setInvalid(true);
      setStatus(t("checkout.chooseProofFile"));
      document.getElementById(`${id}-file`)?.focus();
      return;
    }
    setInvalid(false);
    setBusy(true);
    setStatus(t("common.sending"));
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch(`/api/shop/${encodeURIComponent(slug)}/orders/${orderId}/payment-proof`, { method: "POST", body });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setInvalid(res.status === 400);
        setStatus(typeof data.error === "string" ? data.error : t("checkout.couldntSend"));
        return;
      }
      setSent(true);
      setStatus(t("checkout.proofThanks", { store: storeName }));
    } catch {
      setStatus(t("common.offline"));
    } finally {
      setBusy(false);
    }
  };

  if (sent) {
    return (
      <p className="proof-upload__done" role="status">
        <Icon name="check-circle" size="sm" /> {status || t("checkout.proofAlreadySent", { store: storeName })}
      </p>
    );
  }

  return (
    <form className="proof-upload" onSubmit={submit} noValidate>
      <div className="field">
        <label htmlFor={`${id}-file`}>
          {t("checkout.proofLabel")} <span className="optional">{t("common.optional")}</span>
        </label>
        <input
          className="input"
          id={`${id}-file`}
          name="file"
          type="file"
          accept="image/jpeg,image/png,image/webp,application/pdf"
          aria-invalid={invalid || undefined}
          aria-describedby={`${id}-hint ${id}-status`}
        />
        <p className="hint" id={`${id}-hint`}>
          {t("checkout.proofHint", { store: storeName })}
        </p>
      </div>
      <button className="btn btn--outline" type="submit" disabled={busy}>
        {busy ? t("common.sending") : t("checkout.sendProof")}
      </button>
      <p className="form-status" role="status" id={`${id}-status`}>
        {status}
      </p>
    </form>
  );
}

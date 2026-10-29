"use client";

import { useState } from "react";
import Link from "next/link";
import { useStorefront, useT } from "./StorefrontProvider";
import { Icon } from "./primitives";

/**
 * "Unsubscribe": a button rather than unsubscribing on page load, because some
 * mail apps open links in emails to check them before anyone clicks.
 */
export default function UnsubscribeForm({ unsubscribeKey, recipientToken, shopHref, storeName }: { unsubscribeKey: string; recipientToken: string | null; shopHref: string; storeName: string }) {
  const { slug } = useStorefront();
  const t = useT();
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);
  const [status, setStatus] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSending(true);
    setStatus("");
    try {
      const res = await fetch(`/api/shop/${encodeURIComponent(slug)}/marketing/unsubscribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: unsubscribeKey, token: recipientToken }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setStatus(typeof data.error === "string" ? data.error : t("account.couldNotSave"));
        return;
      }
      setDone(true);
    } catch {
      setStatus(t("common.offline"));
    } finally {
      setSending(false);
    }
  };

  if (done) {
    return (
      <div className="review-thanks" role="status">
        <Icon name="check-circle" />
        <h2 className="h-section">{t("account.unsubscribed")}</h2>
        <p className="body-copy">{t("account.unsubscribedBody", { storeName })}</p>
        <Link className="btn btn--primary" href={shopHref}>
          {t("account.backToShop")}
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={submit} noValidate aria-label={t("account.unsubscribeLabel")}>
      <p className="lead">{t("account.unsubscribeLead", { storeName })}</p>
      <button className="btn btn--primary" type="submit" disabled={sending}>
        {sending ? t("common.saving") : t("account.unsubscribe")}
      </button>
      <p className="form-status" role="status">
        {status}
      </p>
    </form>
  );
}

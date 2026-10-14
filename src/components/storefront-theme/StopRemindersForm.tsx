"use client";

import { useState } from "react";
import Link from "next/link";
import { useStorefront } from "./StorefrontProvider";
import { Icon } from "./primitives";

/**
 * "Stop basket reminders": a button rather than stopping on page load, because
 * some mail apps open links in emails to check them before anyone clicks.
 */
export default function StopRemindersForm({ reminderKey, shopHref, storeName }: { reminderKey: string; shopHref: string; storeName: string }) {
  const { slug } = useStorefront();
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);
  const [status, setStatus] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSending(true);
    setStatus("");
    try {
      const res = await fetch(`/api/shop/${encodeURIComponent(slug)}/reminders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: reminderKey }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setStatus(typeof data.error === "string" ? data.error : "We couldn't save that. Please try again.");
        return;
      }
      setDone(true);
    } catch {
      setStatus("We couldn't connect. Check your internet connection and try again.");
    } finally {
      setSending(false);
    }
  };

  if (done) {
    return (
      <div className="review-thanks" role="status">
        <Icon name="check-circle" />
        <h2 className="h-section">You won&rsquo;t get basket reminders from us again</h2>
        <p className="body-copy">We&rsquo;ll still email you about any order you place, such as your receipt and delivery updates.</p>
        <Link className="btn btn--primary" href={shopHref}>
          Back to the shop
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={submit} noValidate aria-label="Stop basket reminders">
      <p className="lead">
        If you leave something in your basket at {storeName}, we may send you a reminder by email. You can stop these at any time. Emails about orders you place, like
        receipts, will still come.
      </p>
      <button className="btn btn--primary" type="submit" disabled={sending}>
        {sending ? "Saving…" : "Stop basket reminders"}
      </button>
      <p className="form-status" role="status">
        {status}
      </p>
    </form>
  );
}

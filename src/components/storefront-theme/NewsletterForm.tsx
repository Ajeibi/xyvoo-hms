"use client";

import { useState } from "react";
import { useStorefront } from "./StorefrontProvider";

/** The newsletter sign-up: an email address, and nothing is sent until they have chosen to join. */
export default function NewsletterForm({ note }: { note: string }) {
  const { slug } = useStorefront();
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState("");
  const [done, setDone] = useState(false);
  const [invalid, setInvalid] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    // Checked here so the shopper hears what to fix, and the field is marked, before anything is sent.
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setInvalid(true);
      setStatus("Enter an email address in the format name@example.com.");
      document.getElementById("newsletter-email")?.focus();
      return;
    }
    setInvalid(false);
    setSending(true);
    setStatus("");
    try {
      const res = await fetch(`/api/shop/${encodeURIComponent(slug)}/marketing/subscribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setStatus(typeof data.error === "string" ? data.error : "We couldn't sign you up. Please try again.");
        return;
      }
      setDone(true);
      setStatus("You're on the list. Thank you!");
    } catch {
      setStatus("We couldn't connect. Check your internet connection and try again.");
    } finally {
      setSending(false);
    }
  };

  if (done) {
    return (
      <p className="form-status" role="status">
        {status}
      </p>
    );
  }

  return (
    <form className="newsletter__form" onSubmit={submit} noValidate>
      <label className="visually-hidden" htmlFor="newsletter-email">
        Email address
      </label>
      <input
        id="newsletter-email"
        className="input"
        type="email"
        autoComplete="email"
        placeholder="Your email address"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
        aria-invalid={invalid || undefined}
        aria-describedby={invalid ? "newsletter-status" : undefined}
      />
      <button className="btn btn--primary" type="submit" disabled={sending}>
        {sending ? "Joining…" : "Join"}
      </button>
      {note ? <p className="newsletter__note">{note}</p> : null}
      <p className="form-status" role="status" id="newsletter-status">
        {status}
      </p>
    </form>
  );
}

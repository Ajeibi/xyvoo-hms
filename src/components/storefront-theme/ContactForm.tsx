"use client";

import { useState } from "react";
import { useStorefront } from "./StorefrontProvider";

type Field = "name" | "email" | "message";
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TOPICS = ["A question about a product", "An existing order", "Delivery", "Returns and exchanges", "Something else"];

/** The Contact page's message form. Sends to the shop by email; nothing is stored in the browser. */
export default function ContactForm({ heading, intro, replyTime, privacyHref }: { heading: string; intro: string; replyTime: string; privacyHref: string | null }) {
  const { slug } = useStorefront();
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [status, setStatus] = useState("");
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const get = (n: string) => String(data.get(n) ?? "").trim();
    const found: Partial<Record<Field, string>> = {};
    if (!get("name")) found.name = "Enter your full name.";
    if (!get("email")) found.email = "Enter your email address.";
    else if (!EMAIL_PATTERN.test(get("email"))) found.email = "Enter an email address in the format name@example.com.";
    if (get("message").length < 5) found.message = "Enter your message.";
    setErrors(found);
    const first = (["name", "email", "message"] as Field[]).find((f) => found[f]);
    if (first) {
      setStatus("Please correct the highlighted fields.");
      form.querySelector<HTMLElement>(`#c-${first}`)?.focus();
      return;
    }

    setSending(true);
    setStatus("Sending your message…");
    try {
      const res = await fetch(`/api/shop/${encodeURIComponent(slug)}/contact`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: get("name"), email: get("email"), phone: get("phone"), orderRef: get("order"), topic: get("topic"), message: get("message"), website: get("website") }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setStatus(typeof body.error === "string" ? body.error : "We couldn't send your message. Please try again.");
        return;
      }
      form.reset();
      setSent(true);
      setStatus(`Thank you. Your message has been sent${replyTime ? ` and we'll reply ${replyTime}` : ""}.`);
    } catch {
      setStatus("We couldn't connect. Check your internet connection and try again.");
    } finally {
      setSending(false);
    }
  };

  const field = (name: Field) => ({
    id: `c-${name}`,
    name,
    "aria-invalid": errors[name] ? true : undefined,
    "aria-describedby": errors[name] ? `c-${name}-error` : undefined,
  });
  const error = (name: Field) =>
    errors[name] ? (
      <p className="error-msg" id={`c-${name}-error`}>
        {errors[name]}
      </p>
    ) : null;

  return (
    <div>
      <h2 className="h-card" id="form-title">
        {heading}
      </h2>
      <p className="body-copy form-intro">{intro || "All fields are required unless marked optional."}</p>
      <form className="contact-form" onSubmit={submit} noValidate aria-labelledby="form-title">
        <div className="form-row">
          <div className="field">
            <label htmlFor="c-name">Full name</label>
            <input className="input" type="text" autoComplete="name" {...field("name")} />
            {error("name")}
          </div>
          <div className="field">
            <label htmlFor="c-email">Email address</label>
            <input className="input" type="email" autoComplete="email" inputMode="email" {...field("email")} />
            {error("email")}
          </div>
        </div>
        <div className="form-row">
          <div className="field">
            <label htmlFor="c-phone">
              Phone number <span className="optional">(optional)</span>
            </label>
            <input className="input" id="c-phone" name="phone" type="tel" autoComplete="tel" inputMode="tel" />
          </div>
          <div className="field">
            <label htmlFor="c-order">
              Order number <span className="optional">(optional)</span>
            </label>
            <input className="input" id="c-order" name="order" type="text" aria-describedby="c-order-hint" />
            <p className="hint" id="c-order-hint">
              You&rsquo;ll find this in your confirmation email.
            </p>
          </div>
        </div>
        <div className="field">
          <label htmlFor="c-topic">What is it about?</label>
          <select className="select" id="c-topic" name="topic" defaultValue={TOPICS[0]}>
            {TOPICS.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="c-message">Your message</label>
          <textarea className="textarea" rows={6} {...field("message")} />
          {error("message")}
        </div>
        {/* Hidden from people (and screen readers); bots that fill it in are ignored. */}
        <div aria-hidden="true" style={{ position: "absolute", left: "-10000px", width: 1, height: 1, overflow: "hidden" }}>
          <label htmlFor="c-website">Leave this empty</label>
          <input id="c-website" name="website" type="text" tabIndex={-1} autoComplete="off" />
        </div>
        <div className="form-actions">
          <button className="btn btn--primary" type="submit" disabled={sending}>
            {sending ? "Sending…" : sent ? "Send another message" : "Send message"}
          </button>
          {replyTime ? <p>We reply {replyTime}.</p> : null}
        </div>
        <p className="form-status" role="status">
          {status}
        </p>
        <p className="hint">
          We&rsquo;ll only use your details to answer your message.
          {privacyHref ? (
            <>
              {" "}
              Read our <a href={privacyHref}>privacy policy</a>.
            </>
          ) : null}
        </p>
      </form>
    </div>
  );
}

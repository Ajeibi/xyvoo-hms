"use client";

import { useState } from "react";
import { useStorefront, useT } from "./StorefrontProvider";

type Field = "name" | "email" | "message";
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// The shop's email always gets the English topic; the shopper sees it in their language.
const TOPICS = [
  { value: "A question about a product", label: "listing.topicProduct" },
  { value: "An existing order", label: "listing.topicOrder" },
  { value: "Delivery", label: "listing.topicDelivery" },
  { value: "Returns and exchanges", label: "listing.topicReturns" },
  { value: "Something else", label: "listing.topicOther" },
] as const;

/** The Contact page's message form. Sends to the shop by email; nothing is stored in the browser. */
export default function ContactForm({ heading, intro, replyTime, privacyHref }: { heading: string; intro: string; replyTime: string; privacyHref: string | null }) {
  const { slug } = useStorefront();
  const t = useT();
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
    if (!get("name")) found.name = t("listing.enterFullName");
    if (!get("email")) found.email = t("listing.enterEmail");
    else if (!EMAIL_PATTERN.test(get("email"))) found.email = t("listing.emailFormat");
    if (get("message").length < 5) found.message = t("listing.enterMessage");
    setErrors(found);
    const first = (["name", "email", "message"] as Field[]).find((f) => found[f]);
    if (first) {
      setStatus(t("listing.correctFields"));
      form.querySelector<HTMLElement>(`#c-${first}`)?.focus();
      return;
    }

    setSending(true);
    setStatus(t("listing.sendingMessage"));
    try {
      const res = await fetch(`/api/shop/${encodeURIComponent(slug)}/contact`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: get("name"), email: get("email"), phone: get("phone"), orderRef: get("order"), topic: get("topic"), message: get("message"), website: get("website") }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setStatus(typeof body.error === "string" ? body.error : t("listing.sendFailed"));
        return;
      }
      form.reset();
      setSent(true);
      setStatus(replyTime ? t("listing.messageSentReply", { replyTime }) : t("listing.messageSent"));
    } catch {
      setStatus(t("common.offline"));
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
      <p className="body-copy form-intro">{intro || t("listing.allFieldsRequired")}</p>
      <form className="contact-form" onSubmit={submit} noValidate aria-labelledby="form-title">
        <div className="form-row">
          <div className="field">
            <label htmlFor="c-name">{t("listing.fullName")}</label>
            <input className="input" type="text" autoComplete="name" {...field("name")} />
            {error("name")}
          </div>
          <div className="field">
            <label htmlFor="c-email">{t("common.email")}</label>
            <input className="input" type="email" autoComplete="email" inputMode="email" {...field("email")} />
            {error("email")}
          </div>
        </div>
        <div className="form-row">
          <div className="field">
            <label htmlFor="c-phone">
              {t("common.phone")} <span className="optional">{t("common.optional")}</span>
            </label>
            <input className="input" id="c-phone" name="phone" type="tel" autoComplete="tel" inputMode="tel" />
          </div>
          <div className="field">
            <label htmlFor="c-order">
              {t("listing.orderNumber")} <span className="optional">{t("common.optional")}</span>
            </label>
            <input className="input" id="c-order" name="order" type="text" aria-describedby="c-order-hint" />
            <p className="hint" id="c-order-hint">
              {t("listing.orderHint")}
            </p>
          </div>
        </div>
        <div className="field">
          <label htmlFor="c-topic">{t("listing.topicLabel")}</label>
          <select className="select" id="c-topic" name="topic" defaultValue={TOPICS[0].value}>
            {TOPICS.map((topic) => (
              <option key={topic.value} value={topic.value}>
                {t(topic.label)}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="c-message">{t("listing.yourMessage")}</label>
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
            {sending ? t("common.sending") : sent ? t("listing.sendAnother") : t("listing.sendMessage")}
          </button>
          {replyTime ? <p>{t("listing.weReply", { replyTime })}</p> : null}
        </div>
        <p className="form-status" role="status">
          {status}
        </p>
        <p className="hint">
          {t("listing.detailsUse")}
          {privacyHref ? (
            <>
              {" "}
              {t.rich("listing.readPrivacy", { link: <a href={privacyHref}>{t("listing.privacyPolicy")}</a> })}
            </>
          ) : null}
        </p>
      </form>
    </div>
  );
}

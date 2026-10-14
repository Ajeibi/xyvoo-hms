"use client";

import { useId, useState } from "react";
import { announce, useStorefront } from "./StorefrontProvider";
import { refreshShopAccount } from "./useShopAccount";

/*
 * Shopper account forms, shared by the account invitation and the Account
 * page. No passwords: a new account signs in straight away, and an existing
 * one signs in with a 6-digit code we email.
 */

async function post(url: string, body: object) {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "Something went wrong. Please try again.");
  return data;
}

const failed = (e: unknown) => (e instanceof TypeError ? "We couldn't connect. Check your internet connection and try again." : (e as Error).message);

/** "Enter the code we emailed you." */
export function CodeForm({ email, intro, onDone }: { email: string; intro: string; onDone: () => void }) {
  const { slug } = useStorefront();
  const id = useId();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^\d{6}$/.test(code.trim())) return setStatus("Enter the 6-digit code from the email.");
    setBusy(true);
    setStatus("");
    try {
      await post(`/api/shop/${encodeURIComponent(slug)}/account/verify`, { email, code: code.trim() });
      await refreshShopAccount(slug);
      announce("You're signed in.");
      onDone();
    } catch (err) {
      setStatus(failed(err));
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    setStatus("");
    try {
      await post(`/api/shop/${encodeURIComponent(slug)}/account/code`, { email });
      setStatus("If you can't see it, check your junk folder. We've sent a new code if one was due.");
    } catch (err) {
      setStatus(failed(err));
    }
  };

  return (
    <form className="account-form" onSubmit={submit} noValidate>
      <p className="body-copy">{intro}</p>
      <div className="field">
        <label htmlFor={`${id}-code`}>6-digit code</label>
        <input
          className="input account-form__code"
          id={`${id}-code`}
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
        />
      </div>
      <div className="account-form__actions">
        <button className="btn btn--primary" type="submit" disabled={busy}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
        <button className="link-button" type="button" onClick={resend}>
          Send a new code
        </button>
      </div>
      <p className="form-status" role="status">
        {status}
      </p>
    </form>
  );
}

/** Create an account: name, email, optional phone and an optional (unticked) agreement to be contacted. */
export function CreateAccountForm({
  source,
  storeName,
  privacyHref,
  onDone,
  submitLabel = "Create my account",
  extraActions,
}: {
  source: "prompt" | "account_page";
  storeName: string;
  privacyHref?: string | null;
  onDone: () => void;
  submitLabel?: string;
  extraActions?: React.ReactNode;
}) {
  const { slug } = useStorefront();
  const id = useId();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [codeFor, setCodeFor] = useState<string | null>(null);

  if (codeFor) {
    return (
      <CodeForm
        email={codeFor}
        intro={`You already have an account with ${storeName}. We've emailed a 6-digit code to ${codeFor}. Enter it here to sign in.`}
        onDone={onDone}
      />
    );
  }

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const get = (name: string) => String(form.get(name) ?? "").trim();
    if (!get("name")) return setStatus("Enter your name.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(get("email"))) return setStatus("Enter an email address in the format name@example.com.");
    setBusy(true);
    setStatus("");
    try {
      const data = await post(`/api/shop/${encodeURIComponent(slug)}/account/signup`, {
        name: get("name"),
        email: get("email"),
        phone: get("phone") || undefined,
        consent: form.get("consent") === "yes",
        source,
      });
      if (data.needsCode) {
        setCodeFor(String(data.email));
        return;
      }
      await refreshShopAccount(slug);
      announce("Your account is ready.");
      onDone();
    } catch (err) {
      setStatus(failed(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="account-form" onSubmit={submit} noValidate>
      <div className="field">
        <label htmlFor={`${id}-name`}>Your name</label>
        <input className="input" id={`${id}-name`} name="name" autoComplete="name" maxLength={120} />
      </div>
      <div className="field">
        <label htmlFor={`${id}-email`}>Email address</label>
        <input className="input" id={`${id}-email`} name="email" type="email" inputMode="email" autoComplete="email" maxLength={200} />
      </div>
      <div className="field">
        <label htmlFor={`${id}-phone`}>
          Phone number <span className="optional">(optional)</span>
        </label>
        <input className="input" id={`${id}-phone`} name="phone" type="tel" inputMode="tel" autoComplete="tel" maxLength={40} />
      </div>
      <label className="check check--top">
        <input type="checkbox" name="consent" value="yes" />
        <span>Yes, {storeName} can contact me about my basket, new arrivals and offers. I can change this at any time.</span>
      </label>
      <p className="hint">
        {`No password needed: next time, we’ll email you a code to sign in. With an account, ${storeName} can see the products you look at and what’s in your basket, so they can help you.`}
        {privacyHref ? (
          <>
            {" "}
            <a href={privacyHref}>Read the privacy policy</a>.
          </>
        ) : null}
      </p>
      <div className="account-form__actions">
        <button className="btn btn--primary" type="submit" disabled={busy}>
          {busy ? "Creating your account…" : submitLabel}
        </button>
        {extraActions}
      </div>
      <p className="form-status" role="status">
        {status}
      </p>
    </form>
  );
}

/** Sign in: email, then the code we send. */
export function SignInForm({ storeName, onDone }: { storeName: string; onDone: () => void }) {
  const { slug } = useStorefront();
  const id = useId();
  const [email, setEmail] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");

  if (sentTo) {
    return (
      <CodeForm
        email={sentTo}
        intro={`If ${sentTo} has an account with ${storeName}, we've emailed it a 6-digit code. It expires in 10 minutes.`}
        onDone={onDone}
      />
    );
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const value = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return setStatus("Enter an email address in the format name@example.com.");
    setBusy(true);
    setStatus("");
    try {
      await post(`/api/shop/${encodeURIComponent(slug)}/account/code`, { email: value });
      setSentTo(value);
    } catch (err) {
      setStatus(failed(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="account-form" onSubmit={submit} noValidate>
      <div className="field">
        <label htmlFor={`${id}-email`}>Email address</label>
        <input className="input" id={`${id}-email`} type="email" inputMode="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <p className="hint">We&rsquo;ll email you a code to sign in. No password needed.</p>
      </div>
      <div className="account-form__actions">
        <button className="btn btn--primary" type="submit" disabled={busy}>
          {busy ? "Sending…" : "Email me a code"}
        </button>
      </div>
      <p className="form-status" role="status">
        {status}
      </p>
    </form>
  );
}

"use client";

import { useId, useState } from "react";
import { announce, useStorefront, useT } from "./StorefrontProvider";
import type { Translator } from "@/lib/store/i18n/translate";
import { refreshShopAccount } from "./useShopAccount";

/*
 * Shopper account forms, shared by the account invitation and the Account
 * page. No passwords: a new account signs in straight away, and an existing
 * one signs in with a 6-digit code we email.
 */

async function post(url: string, body: object, t: Translator) {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : t("common.somethingWrong"));
  return data;
}

/** Marks a field the shopper needs to fix, and points it at the message saying how. */
const invalidProps = (invalid: boolean, id: string) => ({ "aria-invalid": invalid || undefined, "aria-describedby": invalid ? `${id}-status` : undefined });

const failed = (e: unknown, t: Translator) => (e instanceof TypeError ? t("common.offline") : (e as Error).message);

/** "Enter the code we emailed you." */
export function CodeForm({ email, intro, onDone }: { email: string; intro: string; onDone: () => void }) {
  const { slug } = useStorefront();
  const t = useT();
  const id = useId();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [invalid, setInvalid] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^\d{6}$/.test(code.trim())) {
      setInvalid(true);
      document.getElementById(`${id}-code`)?.focus();
      return setStatus(t("account.enterCode"));
    }
    setInvalid(false);
    setBusy(true);
    setStatus("");
    try {
      await post(`/api/shop/${encodeURIComponent(slug)}/account/verify`, { email, code: code.trim() }, t);
      await refreshShopAccount(slug);
      announce(t("account.signedIn"));
      onDone();
    } catch (err) {
      setStatus(failed(err, t));
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    setStatus("");
    try {
      await post(`/api/shop/${encodeURIComponent(slug)}/account/code`, { email }, t);
      setStatus(t("account.codeResent"));
    } catch (err) {
      setStatus(failed(err, t));
    }
  };

  return (
    <form className="account-form" onSubmit={submit} noValidate>
      <p className="body-copy">{intro}</p>
      <div className="field">
        <label htmlFor={`${id}-code`}>{t("account.codeLabel")}</label>
        <input
          className="input account-form__code"
          id={`${id}-code`}
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          aria-invalid={invalid || undefined}
          aria-describedby={invalid ? `${id}-status` : undefined}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
        />
      </div>
      <div className="account-form__actions">
        <button className="btn btn--primary" type="submit" disabled={busy}>
          {busy ? t("account.signingIn") : t("account.signIn")}
        </button>
        <button className="link-button" type="button" onClick={resend}>
          {t("account.sendNewCode")}
        </button>
      </div>
      <p className="form-status" role="status" id={`${id}-status`}>
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
  submitLabel,
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
  const t = useT();
  const id = useId();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [codeFor, setCodeFor] = useState<string | null>(null);
  const [invalid, setInvalid] = useState<"name" | "email" | null>(null);

  if (codeFor) {
    return (
      <CodeForm
        email={codeFor}
        intro={t("account.existingAccountCode", { storeName, email: codeFor })}
        onDone={onDone}
      />
    );
  }

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const get = (name: string) => String(form.get(name) ?? "").trim();
    const problem: ["name" | "email", string] | null = !get("name")
      ? ["name", t("account.enterName")]
      : !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(get("email"))
        ? ["email", t("account.enterEmail")]
        : null;
    setInvalid(problem?.[0] ?? null);
    if (problem) {
      document.getElementById(`${id}-${problem[0]}`)?.focus();
      return setStatus(problem[1]);
    }
    setBusy(true);
    setStatus("");
    try {
      const data = await post(`/api/shop/${encodeURIComponent(slug)}/account/signup`, {
        name: get("name"),
        email: get("email"),
        phone: get("phone") || undefined,
        consent: form.get("consent") === "yes",
        marketing: form.get("marketing") === "yes",
        source,
      }, t);
      if (data.needsCode) {
        setCodeFor(String(data.email));
        return;
      }
      await refreshShopAccount(slug);
      announce(t("account.accountReady"));
      onDone();
    } catch (err) {
      setStatus(failed(err, t));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="account-form" onSubmit={submit} noValidate>
      <div className="field">
        <label htmlFor={`${id}-name`}>{t("account.yourName")}</label>
        <input className="input" id={`${id}-name`} name="name" autoComplete="name" maxLength={120} {...invalidProps(invalid === "name", id)} />
      </div>
      <div className="field">
        <label htmlFor={`${id}-email`}>{t("common.email")}</label>
        <input className="input" id={`${id}-email`} name="email" type="email" inputMode="email" autoComplete="email" maxLength={200} {...invalidProps(invalid === "email", id)} />
      </div>
      <div className="field">
        <label htmlFor={`${id}-phone`}>
          {t("common.phone")} <span className="optional">{t("common.optional")}</span>
        </label>
        <input className="input" id={`${id}-phone`} name="phone" type="tel" inputMode="tel" autoComplete="tel" maxLength={40} />
      </div>
      <label className="check check--top">
        <input type="checkbox" name="consent" value="yes" />
        <span>{t("account.consentYes", { storeName })}</span>
      </label>
      <label className="check check--top">
        <input type="checkbox" name="marketing" value="yes" />
        <span>{t("account.marketingOptIn", { storeName })}</span>
      </label>
      <p className="hint">
        {t("account.noPasswordHint", { storeName })}
        {privacyHref ? (
          <>
            {" "}
            <a href={privacyHref}>{t("account.readPrivacy")}</a>.
          </>
        ) : null}
      </p>
      <div className="account-form__actions">
        <button className="btn btn--primary" type="submit" disabled={busy}>
          {busy ? t("account.creatingAccount") : (submitLabel ?? t("account.createMyAccount"))}
        </button>
        {extraActions}
      </div>
      <p className="form-status" role="status" id={`${id}-status`}>
        {status}
      </p>
    </form>
  );
}

/** Sign in: email, then the code we send. */
export function SignInForm({ storeName, onDone }: { storeName: string; onDone: () => void }) {
  const { slug } = useStorefront();
  const t = useT();
  const id = useId();
  const [email, setEmail] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [invalid, setInvalid] = useState(false);

  if (sentTo) {
    return (
      <CodeForm
        email={sentTo}
        intro={t("account.signInCodeSent", { email: sentTo, storeName })}
        onDone={onDone}
      />
    );
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const value = email.trim().toLowerCase();
    const bad = !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
    setInvalid(bad);
    if (bad) {
      document.getElementById(`${id}-email`)?.focus();
      return setStatus(t("account.enterEmail"));
    }
    setBusy(true);
    setStatus("");
    try {
      await post(`/api/shop/${encodeURIComponent(slug)}/account/code`, { email: value }, t);
      setSentTo(value);
    } catch (err) {
      setStatus(failed(err, t));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="account-form" onSubmit={submit} noValidate>
      <div className="field">
        <label htmlFor={`${id}-email`}>{t("common.email")}</label>
        <input className="input" id={`${id}-email`} type="email" inputMode="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} {...invalidProps(invalid, id)} />
        <p className="hint">{t("account.signInHint")}</p>
      </div>
      <div className="account-form__actions">
        <button className="btn btn--primary" type="submit" disabled={busy}>
          {busy ? t("common.sending") : t("account.emailMeCode")}
        </button>
      </div>
      <p className="form-status" role="status" id={`${id}-status`}>
        {status}
      </p>
    </form>
  );
}

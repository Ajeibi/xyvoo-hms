"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, CircleAlert, MailCheck, UserCog } from "lucide-react";
import { supabaseAuthBrowser } from "@/lib/supabase/auth-browser";

type ClosedProps = { token: string; state: "invalid" | "expired" | "accepted" | "cancelled" };
type OpenProps = {
  token: string;
  state: "open";
  storeName: string;
  dashboardPath: string;
  name: string;
  email: string;
  roleLabel: string;
  roleDescription: string;
  signedInEmail: string | null;
  hasAccount: boolean;
  alreadyMember: boolean;
};

const input =
  "w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-base text-slate-900 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-xyvoo-blue aria-[invalid=true]:border-red-500";
const primary =
  "inline-flex w-full items-center justify-center rounded-xl bg-xyvoo-blue px-5 py-3 text-sm font-semibold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-xyvoo-blue";

const CLOSED_COPY: Record<ClosedProps["state"], { title: string; body: string }> = {
  invalid: { title: "This invitation link doesn't work", body: "It may have been copied incompletely, or replaced by a newer invitation. Ask the shop to send you a new one." },
  expired: { title: "This invitation has expired", body: "Invitations last 7 days. Ask the shop to send it again; the new email has a fresh link." },
  accepted: { title: "This invitation has already been used", body: "If it was you, sign in to open the shop's dashboard." },
  cancelled: { title: "This invitation was cancelled", body: "The shop cancelled it. If you think that's a mistake, ask them to invite you again." },
};

async function post(url: string, body: object) {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = new Error(typeof data.error === "string" ? data.error : "Something went wrong. Please try again.") as Error & { field?: string };
    error.field = typeof data.field === "string" ? data.field : undefined;
    throw error;
  }
  return data;
}

function ErrorMessage({ id, message }: { id: string; message: string }) {
  if (!message) return null;
  return (
    <div id={id} role="alert" className="flex gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
      <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-red-600" aria-hidden />
      <p>{message}</p>
    </div>
  );
}

/** Accepting a team invitation: sign in or create an account, then enter the code emailed to the invited address. */
export default function JoinTeam(props: ClosedProps | OpenProps) {
  if (props.state !== "open") {
    const copy = CLOSED_COPY[props.state];
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-6 text-center sm:p-8">
        <CircleAlert className="mx-auto h-8 w-8 text-amber-600" aria-hidden />
        <h1 className="mt-3 text-xl font-semibold text-slate-900">
          {copy.title}
        </h1>
        <p className="mt-2 text-sm text-slate-600">{copy.body}</p>
        <Link href="/auth/login/storefront" className="mt-6 inline-block text-sm font-medium text-blue-800 underline underline-offset-2">
          Go to sign in
        </Link>
      </section>
    );
  }
  return <OpenInvite {...props} />;
}

function OpenInvite(props: OpenProps) {
  const router = useRouter();
  const signedInAsInvitee = props.signedInEmail?.toLowerCase() === props.email;
  const [mode, setMode] = useState<"signin" | "signup">(props.hasAccount ? "signin" : "signup");
  const [codeSent, setCodeSent] = useState(false);
  const [code, setCode] = useState("");
  const [name, setName] = useState(props.name);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ message: string; field?: string }>({ message: "" });
  const [status, setStatus] = useState("");
  const codeInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (codeSent) codeInput.current?.focus();
  }, [codeSent]);

  const fail = (e: unknown) => {
    const err = e as Error & { field?: string };
    setError({ message: err.message || "Something went wrong. Please try again.", field: err.field });
    if (err.field === "existing") setMode("signin");
  };

  const sendCode = async () => {
    setBusy(true);
    setError({ message: "" });
    setStatus("");
    try {
      await post("/api/store/team/join/code", { token: props.token });
      setCodeSent(true);
      setStatus(`We've emailed a 6-digit code to ${props.email}. It lasts 10 minutes.`);
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  const signIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError({ message: "" });
    const { error: signInError } = await supabaseAuthBrowser.auth.signInWithPassword({ email: props.email, password });
    if (signInError) {
      setBusy(false);
      setError({
        message: /invalid/i.test(signInError.message) ? "That password isn't right. Try again, or reset your password." : "We couldn't sign you in. Please try again.",
        field: "password",
      });
      return;
    }
    // The page reloads its details with you signed in, then asks for the code.
    router.refresh();
  };

  const join = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError({ message: "" });
    try {
      if (signedInAsInvitee) {
        const data = await post("/api/store/team/join/accept", { token: props.token, code: code.trim() });
        window.location.assign(data.redirectTo);
        return;
      }
      const data = await post("/api/store/team/join/signup", { token: props.token, code: code.trim(), name, password });
      const { error: signInError } = await supabaseAuthBrowser.auth.signInWithPassword({ email: data.email, password });
      window.location.assign(signInError ? "/auth/login/storefront" : data.redirectTo);
    } catch (err) {
      fail(err);
      setBusy(false);
    }
  };

  const signOut = async () => {
    setBusy(true);
    await supabaseAuthBrowser.auth.signOut();
    router.refresh();
    setBusy(false);
  };

  const errorFor = (field: string) => (error.field === field ? error.message : "");
  const generalError = error.message && !["code", "password", "name"].includes(error.field ?? "") ? error.message : "";

  const intro = (
    <div className="text-center">
      <span aria-hidden className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-700">
        <UserCog className="h-6 w-6" />
      </span>
      <h1 className="mt-3 text-2xl font-semibold text-slate-900">Join {props.storeName}</h1>
      <p className="mt-2 text-sm text-slate-600">
        Hello {props.name}, you&rsquo;ve been invited as {props.roleLabel === "Admin" ? "an" : "a"} <strong>{props.roleLabel}</strong>. {props.roleDescription}
      </p>
    </div>
  );

  if (props.alreadyMember) {
    return (
      <section className="space-y-5 rounded-2xl border border-slate-200 bg-white p-6 sm:p-8">
        {intro}
        <p className="flex gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          You&rsquo;re already on this shop&rsquo;s team.
        </p>
        <Link href={props.dashboardPath} className={primary}>
          Open the dashboard
        </Link>
      </section>
    );
  }

  if (props.signedInEmail && !signedInAsInvitee) {
    return (
      <section className="space-y-5 rounded-2xl border border-slate-200 bg-white p-6 sm:p-8">
        {intro}
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          You&rsquo;re signed in as <strong>{props.signedInEmail}</strong>, but this invitation is for <strong>{props.email}</strong>. Sign out, then sign in or create an account
          with {props.email}.
        </p>
        <button type="button" onClick={signOut} disabled={busy} className={primary}>
          {busy ? "Signing out…" : "Sign out"}
        </button>
      </section>
    );
  }

  const codeField = codeSent ? (
    <div>
      <label htmlFor="join-code" className="mb-1 block text-sm font-medium text-slate-800">
        6-digit code from the email
      </label>
      <input
        ref={codeInput}
        id="join-code"
        className={`${input} tracking-[0.4em]`}
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
        aria-invalid={Boolean(errorFor("code")) || undefined}
        aria-describedby={errorFor("code") ? "join-code-error" : undefined}
      />
      {errorFor("code") ? (
        <p id="join-code-error" className="mt-1 text-sm text-red-700">
          {errorFor("code")}
        </p>
      ) : null}
      <button type="button" onClick={sendCode} disabled={busy} className="mt-2 text-sm font-medium text-blue-800 underline underline-offset-2 disabled:opacity-60">
        Send a new code
      </button>
    </div>
  ) : null;

  const statusLine = status ? (
    <p role="status" className="flex gap-3 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-900">
      <MailCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      {status}
    </p>
  ) : null;

  // Signed in with the invited address: just the code.
  if (signedInAsInvitee) {
    return (
      <section className="space-y-5 rounded-2xl border border-slate-200 bg-white p-6 sm:p-8">
        {intro}
        <p className="text-sm text-slate-700">
          To keep the shop safe, we&rsquo;ll email a code to <strong>{props.email}</strong> to check it&rsquo;s you.
        </p>
        <ErrorMessage id="join-error" message={generalError} />
        {statusLine}
        {codeSent ? (
          <form onSubmit={join} className="space-y-4" noValidate>
            {codeField}
            <button type="submit" disabled={busy || code.length !== 6} className={primary}>
              {busy ? "Joining…" : `Join ${props.storeName}`}
            </button>
          </form>
        ) : (
          <button type="button" onClick={sendCode} disabled={busy} className={primary}>
            {busy ? "Sending…" : "Email me a code"}
          </button>
        )}
      </section>
    );
  }

  return (
    <section className="space-y-5 rounded-2xl border border-slate-200 bg-white p-6 sm:p-8">
      {intro}
      <div role="group" aria-label="Do you have a XYVOO account?" className="grid grid-cols-2 gap-2 rounded-xl bg-slate-100 p-1">
        {(
          [
            ["signin", "I have an account"],
            ["signup", "I'm new to XYVOO"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            aria-pressed={mode === value}
            onClick={() => {
              setMode(value);
              setError({ message: "" });
            }}
            className={`rounded-lg px-3 py-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-xyvoo-blue ${mode === value ? "bg-white text-slate-900 shadow-sm" : "text-slate-600"}`}
          >
            {label}
          </button>
        ))}
      </div>

      <ErrorMessage id="join-error" message={generalError} />

      {mode === "signin" ? (
        <form onSubmit={signIn} className="space-y-4" noValidate>
          <div>
            <p className="mb-1 block text-sm font-medium text-slate-800">Email</p>
            <p className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-700">{props.email}</p>
          </div>
          <div>
            <label htmlFor="join-password" className="mb-1 block text-sm font-medium text-slate-800">
              Password
            </label>
            <input
              id="join-password"
              type="password"
              autoComplete="current-password"
              className={input}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-invalid={Boolean(errorFor("password")) || undefined}
              aria-describedby={errorFor("password") ? "join-password-error" : undefined}
            />
            {errorFor("password") ? (
              <p id="join-password-error" className="mt-1 text-sm text-red-700">
                {errorFor("password")}
              </p>
            ) : null}
          </div>
          <button type="submit" disabled={busy || !password} className={primary}>
            {busy ? "Signing in…" : "Sign in"}
          </button>
          <p className="text-center text-sm">
            <Link href="/auth/forgot-password?for=storefront" className="font-medium text-blue-800 underline underline-offset-2">
              Forgotten your password?
            </Link>
          </p>
        </form>
      ) : (
        <form onSubmit={join} className="space-y-4" noValidate>
          <div>
            <p className="mb-1 block text-sm font-medium text-slate-800">Email</p>
            <p className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-700">{props.email}</p>
          </div>
          <div>
            <label htmlFor="join-name" className="mb-1 block text-sm font-medium text-slate-800">
              Your name
            </label>
            <input
              id="join-name"
              autoComplete="name"
              className={input}
              value={name}
              onChange={(e) => setName(e.target.value)}
              aria-invalid={Boolean(errorFor("name")) || undefined}
              aria-describedby={errorFor("name") ? "join-name-error" : undefined}
            />
            {errorFor("name") ? (
              <p id="join-name-error" className="mt-1 text-sm text-red-700">
                {errorFor("name")}
              </p>
            ) : null}
          </div>
          <div>
            <label htmlFor="join-new-password" className="mb-1 block text-sm font-medium text-slate-800">
              Choose a password
            </label>
            <input
              id="join-new-password"
              type="password"
              autoComplete="new-password"
              className={input}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-invalid={Boolean(errorFor("password")) || undefined}
              aria-describedby={`join-new-password-hint${errorFor("password") ? " join-new-password-error" : ""}`}
            />
            <p id="join-new-password-hint" className="mt-1 text-xs text-slate-500">
              At least 8 characters.
            </p>
            {errorFor("password") ? (
              <p id="join-new-password-error" className="mt-1 text-sm text-red-700">
                {errorFor("password")}
              </p>
            ) : null}
          </div>
          {statusLine}
          {codeField}
          {codeSent ? (
            <button type="submit" disabled={busy || code.length !== 6 || password.length < 8 || !name.trim()} className={primary}>
              {busy ? "Creating your account…" : `Create my account and join`}
            </button>
          ) : (
            <button type="button" onClick={sendCode} disabled={busy || password.length < 8 || !name.trim()} className={primary}>
              {busy ? "Sending…" : "Email me a code"}
            </button>
          )}
          <p className="text-xs text-slate-500">We&rsquo;ll email a code to {props.email} to check it&rsquo;s you before creating your account.</p>
        </form>
      )}
      <p className="text-center text-xs text-slate-500">
        Not expecting this? You can close this page; nothing happens unless you accept.
      </p>
    </section>
  );
}

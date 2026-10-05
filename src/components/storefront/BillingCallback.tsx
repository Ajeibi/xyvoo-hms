"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { CheckCircle2, CircleAlert, Loader2 } from "lucide-react";

/** Confirms the Standard plan payment with the server once the owner is back from Paystack. */
export default function BillingCallback({ slug, reference }: { slug: string; reference: string }) {
  const [state, setState] = useState<{ status: "checking" | "success" | "pending" | "failed" | "error"; message?: string }>({
    status: reference ? "checking" : "error",
    message: reference ? undefined : "The link is missing its payment reference.",
  });
  const called = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (!reference || called.current) return;
    called.current = true;
    fetch(`/api/store/billing/verify?slug=${encodeURIComponent(slug)}&reference=${encodeURIComponent(reference)}`)
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "We couldn't confirm your payment.");
        setState({ status: data.status === "success" ? "success" : data.status === "pending" ? "pending" : "failed" });
      })
      .catch((e) => setState({ status: "error", message: e instanceof Error ? e.message : undefined }));
  }, [slug, reference]);

  useEffect(() => {
    if (state.status !== "checking") heading.current?.focus();
  }, [state.status]);

  const settingsHref = `/storefront/${slug}/payments`;

  return (
    <div className="mx-auto max-w-lg rounded-2xl border border-slate-200 bg-white p-8 text-center">
      {state.status === "checking" ? (
        <>
          <Loader2 className="mx-auto h-6 w-6 animate-spin text-slate-500" aria-hidden />
          <h1 className="mt-3 text-lg font-semibold text-slate-900">Confirming your payment…</h1>
          <p role="status" className="mt-1 text-sm text-slate-600">
            Please keep this page open.
          </p>
        </>
      ) : null}
      {state.status === "success" ? (
        <>
          <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-600" aria-hidden />
          <h1 ref={heading} tabIndex={-1} className="mt-3 text-lg font-semibold text-slate-900">
            You&rsquo;re on the Standard plan
          </h1>
          <p className="mt-1 text-sm text-slate-600">There&rsquo;s no XYVOO fee on your sales from now on. Paystack will renew it monthly.</p>
        </>
      ) : null}
      {state.status === "pending" ? (
        <>
          <h1 ref={heading} tabIndex={-1} className="text-lg font-semibold text-slate-900">
            Your payment is still processing
          </h1>
          <p className="mt-1 text-sm text-slate-600">This can take a minute. Refresh this page shortly. You won&rsquo;t be charged twice.</p>
        </>
      ) : null}
      {state.status === "failed" || state.status === "error" ? (
        <>
          <CircleAlert className="mx-auto h-8 w-8 text-amber-600" aria-hidden />
          <h1 ref={heading} tabIndex={-1} className="mt-3 text-lg font-semibold text-slate-900">
            {state.status === "failed" ? "The payment wasn't completed" : "We couldn't confirm the payment"}
          </h1>
          <p className="mt-1 text-sm text-slate-600">{state.message || "Nothing has been charged. You can try again from your settings."}</p>
        </>
      ) : null}
      <Link href={settingsHref} className="mt-6 inline-block rounded-xl bg-xyvoo-blue px-5 py-3 text-sm font-semibold text-white">
        Back to payments and plan
      </Link>
    </div>
  );
}

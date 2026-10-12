"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, Copy, ExternalLink } from "lucide-react";
import type { GoLiveStatus } from "@/lib/store/go-live";
import { DashAlert, sendJson } from "./dashboard-ui";

/** The words on each step's button: what the merchant will actually do there. */
const STEP_ACTION: Record<string, string> = {
  products: "Add a product",
  payments: "Choose how you get paid",
  delivery: "Set up delivery",
  collections: "Create a collection",
};

/** Home: what's left before the shop can go live, then publishing; once live, a compact status card. */
export default function GoLiveChecklist({
  slug,
  initial,
  canManage,
  liveUrl,
}: {
  slug: string;
  initial: GoLiveStatus;
  canManage: boolean;
  liveUrl: string;
}) {
  const router = useRouter();
  const [status, setStatus] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [warning, setWarning] = useState("");
  const [copied, setCopied] = useState(false);
  const live = status.status === "live";

  const act = async (action: "publish" | "unpublish") => {
    if (action === "unpublish" && !window.confirm("Take your shop offline? Customers will see “opening soon” until you publish again.")) return;
    setError("");
    setBusy(true);
    try {
      const data = await sendJson("/api/store/site/publish", "POST", { slug, action });
      setStatus(data.status);
      setMessage(action === "publish" ? "Your shop is live. Share the link and you're open for business." : "Your shop is offline.");
      setWarning(action === "publish" && typeof data.warning === "string" ? data.warning : "");
      // The sidebar's Live badge comes from the server layout.
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(new URL(liveUrl, window.location.origin).toString());
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setError("We couldn't copy the link. You can copy it from your browser's address bar after opening the shop.");
    }
  };

  const feedback = (
    <div className="space-y-2 empty:hidden">
      {error ? <DashAlert message={error} /> : null}
      {warning ? (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <p className="min-w-0 flex-1">{warning}</p>
          <Link href={`/storefront/${slug}/payments`} className="shrink-0 font-semibold underline">
            Set up payments
          </Link>
        </div>
      ) : null}
      <p role="status" className="text-sm font-medium text-emerald-700 empty:hidden">
        {message}
      </p>
    </div>
  );

  if (live) {
    return (
      <section aria-labelledby="go-live-title" className="rounded-2xl border border-emerald-200 bg-gradient-to-r from-emerald-50 to-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span aria-hidden className="relative flex h-3 w-3">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60 motion-reduce:animate-none" />
              <span className="relative inline-flex h-3 w-3 rounded-full bg-emerald-500" />
            </span>
            <div>
              <h2 id="go-live-title" className="text-base font-semibold text-slate-900">
                Your shop is open
              </h2>
              <p className="text-sm text-slate-600">
                {status.hasUnpublishedChanges ? "You have website changes customers can't see yet." : "Customers can browse and buy right now."}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {canManage && status.hasUnpublishedChanges ? (
              <button type="button" onClick={() => act("publish")} disabled={busy} className="rounded-xl bg-xyvoo-blue px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
                {busy ? "Publishing…" : "Publish changes"}
              </button>
            ) : null}
            <button type="button" onClick={copyLink} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
              {copied ? <Check className="h-4 w-4 text-emerald-600" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
              {copied ? "Link copied" : "Copy shop link"}
            </button>
            <a href={liveUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
              Visit <ExternalLink className="h-3.5 w-3.5" aria-hidden />
              <span className="sr-only">your shop (opens in a new tab)</span>
            </a>
            {canManage ? (
              <button type="button" onClick={() => act("unpublish")} disabled={busy} className="px-2 text-sm text-slate-500 hover:text-red-700 hover:underline">
                Take offline
              </button>
            ) : null}
          </div>
        </div>
        <div className="mt-3">{feedback}</div>
      </section>
    );
  }

  const steps = status.items;
  const doneCount = steps.filter((s) => s.done).length;
  const percent = Math.round((doneCount / steps.length) * 100);
  // The next thing to do: required steps first, then the recommended ones.
  const next = steps.find((s) => !s.done && s.required && s.key !== "publish") ?? steps.find((s) => !s.done && s.key !== "publish") ?? null;

  return (
    <section aria-labelledby="go-live-title" className="overflow-hidden rounded-2xl border border-blue-100 bg-white shadow-sm">
      <div className="bg-gradient-to-br from-blue-50 via-white to-emerald-50/60 p-6">
        <p className="text-sm font-medium text-blue-800">{status.status === "paused" ? "Your shop is offline" : "Getting started"}</p>
        <h2 id="go-live-title" className="mt-1 text-xl font-semibold text-slate-900">
          {status.status === "paused" ? "Ready to open again?" : next ? "Let's get your shop ready for its first customer" : "Everything's ready. Time to open!"}
        </h2>
        <div className="mt-4 flex items-center gap-3">
          <div
            role="progressbar"
            aria-label="Setup progress"
            aria-valuemin={0}
            aria-valuemax={steps.length}
            aria-valuenow={doneCount}
            aria-valuetext={`${doneCount} of ${steps.length} steps done`}
            className="h-2 flex-1 overflow-hidden rounded-full bg-slate-200"
          >
            <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${percent}%` }} />
          </div>
          <span className="shrink-0 text-sm font-medium text-slate-600">
            {doneCount} of {steps.length} done
          </span>
        </div>
      </div>

      <ol className="divide-y divide-slate-100 border-t border-slate-100">
        {steps.map((item, index) => {
          const isNext = next?.key === item.key;
          return (
            <li key={item.key} className={`flex items-center gap-4 px-6 py-4 ${isNext ? "bg-blue-50/40" : ""}`}>
              <span
                aria-hidden
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${
                  item.done ? "bg-emerald-100 text-emerald-700" : isNext ? "bg-xyvoo-blue text-white" : "border border-slate-300 text-slate-500"
                }`}
              >
                {item.done ? <Check className="h-4 w-4" /> : index + 1}
              </span>
              <div className="min-w-0 flex-1 text-sm">
                <p className={`font-medium ${item.done ? "text-slate-500 line-through decoration-slate-300" : "text-slate-900"}`}>
                  {item.label}
                  <span className="sr-only">{item.done ? " (done)" : " (to do)"}</span>
                  {!item.required && !item.done ? <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-normal text-slate-600">Optional</span> : null}
                </p>
                {!item.done ? <p className="text-slate-600">{item.description}</p> : null}
              </div>
              {!item.done && item.key !== "publish" ? (
                <Link
                  href={`/storefront/${slug}${item.path}`}
                  className={
                    isNext
                      ? "inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-xyvoo-blue px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
                      : "shrink-0 text-sm font-medium text-blue-700 hover:underline"
                  }
                >
                  {isNext ? STEP_ACTION[item.key] ?? "Start" : "Set up"}
                  {isNext ? <ArrowRight className="h-4 w-4" aria-hidden /> : null}
                  <span className="sr-only">: {item.label}</span>
                </Link>
              ) : null}
              {item.key === "publish" && canManage ? (
                <button
                  type="button"
                  onClick={() => act("publish")}
                  disabled={busy || !status.canPublish}
                  aria-describedby={!status.canPublish ? "publish-blocked" : undefined}
                  className="shrink-0 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"
                >
                  {busy ? "Publishing…" : "Open my shop"}
                </button>
              ) : null}
            </li>
          );
        })}
      </ol>

      {!status.canPublish || error || message ? (
        <div className="space-y-2 border-t border-slate-100 px-6 py-4">
          {!status.canPublish ? (
            <p id="publish-blocked" className="text-sm text-slate-600">
              You can open your shop once you&rsquo;ve added a product.
            </p>
          ) : null}
          {feedback}
        </div>
      ) : null}
    </section>
  );
}

"use client";

import { useState } from "react";
import Link from "next/link";
import { CheckCircle2, Circle, ExternalLink, Rocket } from "lucide-react";
import type { GoLiveStatus } from "@/lib/store/go-live";
import { DashAlert, sendJson } from "./dashboard-ui";

/** Overview: what's left before the shop can go live, and publishing. */
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
  const [status, setStatus] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const live = status.status === "live";
  const remaining = status.items.filter((i) => !i.done && i.key !== "publish");

  const act = async (action: "publish" | "unpublish") => {
    if (action === "unpublish" && !window.confirm("Take your shop offline? Customers will see “opening soon” until you publish again.")) return;
    setError("");
    setBusy(true);
    try {
      const data = await sendJson("/api/store/site/publish", "POST", { slug, action });
      setStatus(data.status);
      setMessage(action === "publish" ? "Your shop is live." : "Your shop is offline.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-labelledby="go-live-title" className="rounded-2xl border border-slate-200 bg-white p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 id="go-live-title" className="flex items-center gap-2 text-base font-semibold text-slate-900">
            <Rocket className="h-4 w-4 text-slate-500" aria-hidden />
            {live ? "Your shop is live" : status.status === "paused" ? "Your shop is offline" : "Get your shop ready"}
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            {live
              ? status.hasUnpublishedChanges
                ? "You have website changes that customers can't see yet. Publish to show them."
                : "Customers can browse and buy."
              : remaining.length
                ? `${remaining.length} ${remaining.length === 1 ? "thing" : "things"} left to do.`
                : "Everything's ready."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {live ? (
            <a href={liveUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm font-medium text-blue-700 hover:underline">
              Visit your shop <ExternalLink className="h-3.5 w-3.5" aria-hidden />
              <span className="sr-only">(opens in a new tab)</span>
            </a>
          ) : null}
          {canManage && (!live || status.hasUnpublishedChanges) ? (
            <button
              type="button"
              onClick={() => act("publish")}
              disabled={busy || !status.canPublish}
              aria-describedby={!status.canPublish ? "publish-blocked" : undefined}
              className="rounded-xl bg-xyvoo-blue px-5 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? "Publishing…" : live ? "Publish changes" : "Publish your shop"}
            </button>
          ) : null}
          {canManage && live ? (
            <button type="button" onClick={() => act("unpublish")} disabled={busy} className="text-sm font-medium text-slate-600 hover:text-red-700 hover:underline">
              Take offline
            </button>
          ) : null}
        </div>
      </div>

      {!status.canPublish ? (
        <p id="publish-blocked" className="mt-3 text-sm text-slate-600">
          You can publish once you&rsquo;ve added a product and your payout account.
        </p>
      ) : null}
      <div className="mt-3 space-y-2">
        <DashAlert message={error} />
        <p role="status" className="text-sm text-emerald-700">
          {message}
        </p>
      </div>

      <ol className="mt-4 divide-y divide-slate-100 rounded-xl border border-slate-200">
        {status.items.map((item) => (
          <li key={item.key} className="flex items-center gap-3 px-4 py-3">
            {item.done ? <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" aria-hidden /> : <Circle className="h-5 w-5 shrink-0 text-slate-300" aria-hidden />}
            <div className="min-w-0 flex-1 text-sm">
              <p className={`font-medium ${item.done ? "text-slate-500" : "text-slate-900"}`}>
                {item.label}
                <span className="sr-only">{item.done ? " (done)" : " (to do)"}</span>
                {!item.required ? <span className="ml-2 text-xs font-normal text-slate-500">Recommended</span> : null}
              </p>
              <p className="text-slate-500">{item.description}</p>
            </div>
            {!item.done && item.key !== "publish" ? (
              <Link href={`/storefront/${slug}${item.path}`} className="shrink-0 text-sm font-medium text-blue-700 hover:underline">
                Set up<span className="sr-only">: {item.label}</span>
              </Link>
            ) : null}
          </li>
        ))}
      </ol>
    </section>
  );
}

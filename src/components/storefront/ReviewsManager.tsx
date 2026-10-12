"use client";

import { useEffect, useState } from "react";
import { BadgeCheck, Check, EyeOff, MessageSquareReply, Package, Star, Trash2 } from "lucide-react";
import type { DashboardReview, ReviewStatus } from "@/lib/store/reviews";
import { DashAlert, DashEmptyState, DashFilterChips, DashPill, DashSectionIntro, DashStatus, dashButton, dashInput, sendJson } from "./dashboard-ui";

type Data = {
  reviews: DashboardReview[];
  counts: Record<ReviewStatus, number>;
  page: number;
  pageCount: number;
  autoPublish: boolean;
  canManageSettings: boolean;
};

const TABS: Array<{ status: ReviewStatus; label: string; empty: string }> = [
  { status: "pending", label: "To approve", empty: "Nothing waiting. New reviews show up here for you to check before customers see them." },
  { status: "published", label: "Published", empty: "No published reviews yet. Approve a review and it appears on the product's page." },
  { status: "hidden", label: "Hidden", empty: "No hidden reviews. Hide a review and it disappears from your shop, but you can bring it back." },
];

function Stars({ value }: { value: number }) {
  return (
    <span className="inline-flex items-center gap-0.5" role="img" aria-label={`${value} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} className={`h-4 w-4 ${n <= value ? "fill-amber-400 text-amber-400" : "text-slate-300"}`} aria-hidden />
      ))}
    </span>
  );
}

/** Customer reviews: approve, hide, reply or delete, and choose whether new ones need approval. */
export default function ReviewsManager({ slug }: { slug: string }) {
  const [status, setStatus] = useState<ReviewStatus>("pending");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [replying, setReplying] = useState<{ id: string; text: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/store/reviews?slug=${encodeURIComponent(slug)}&status=${status}&page=${page}`)
      .then(async (r) => {
        const body = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(typeof body.error === "string" ? body.error : "We couldn't load your reviews.");
        if (!cancelled) {
          setData(body);
          setError("");
        }
      })
      .catch((e: Error) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [slug, status, page, version]);

  const act = async (review: DashboardReview, action: "approve" | "hide" | "delete", note: string) => {
    if (action === "delete" && confirmDelete !== review.id) {
      setConfirmDelete(review.id);
      return;
    }
    setBusy(review.id);
    setError("");
    try {
      await sendJson("/api/store/reviews", "PATCH", { slug, id: review.id, action });
      setConfirmDelete(null);
      setMessage(note);
      setVersion((v) => v + 1);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const saveReply = async () => {
    if (!replying) return;
    setBusy(replying.id);
    setError("");
    try {
      await sendJson("/api/store/reviews", "PATCH", { slug, id: replying.id, action: "reply", reply: replying.text });
      setMessage(replying.text.trim() ? "Reply saved. It shows under the review on the product page." : "Reply removed.");
      setReplying(null);
      setVersion((v) => v + 1);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const setAutoPublish = async (on: boolean) => {
    setError("");
    try {
      await sendJson("/api/store/reviews", "PATCH", { slug, autoPublish: on });
      setMessage(on ? "New reviews will now go live straight away." : "New reviews will now wait for you to approve them.");
      setVersion((v) => v + 1);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const tab = TABS.find((t) => t.status === status)!;

  return (
    <div className="space-y-5">
      {error ? <DashAlert message={error} /> : null}
      {message ? <DashStatus message={message} /> : null}

      <DashSectionIntro
        id="reviews"
        meaning="customers"
        art="star"
        title="Reviews from real customers"
        points={[
          "When an order is delivered, we email your customer and ask them to rate what they bought. They can add photos.",
          "You check each review before it appears on your shop, unless you choose to publish them straight away.",
          "Reply to say thank you, or to put things right. Your reply shows under the review.",
        ]}
      />

      {data?.canManageSettings ? (
        <label className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-sm shadow-sm">
          <input type="checkbox" className="mt-0.5 h-4 w-4 accent-blue-600" checked={data.autoPublish} onChange={(e) => void setAutoPublish(e.target.checked)} />
          <span>
            <span className="font-medium text-slate-900">Publish new reviews straight away</span>
            <span className="block text-slate-600">Off: you approve each review first, so nothing appears in your shop until you&rsquo;ve seen it. You can hide any review later either way.</span>
          </span>
        </label>
      ) : null}

      <DashFilterChips
        label="Reviews by status"
        meaning="customers"
        value={status}
        onChange={(next) => {
          setStatus(next);
          setPage(1);
          setMessage("");
        }}
        options={TABS.map((t) => ({ value: t.status, label: t.label, count: data ? data.counts[t.status] : null }))}
      />

      {!data ? (
        error ? null : (
          <div className="space-y-3">
            <p className="sr-only" role="status">
              Loading reviews…
            </p>
            {[0, 1].map((i) => (
              <div key={i} aria-hidden className="h-32 animate-pulse rounded-2xl bg-white motion-reduce:animate-none" />
            ))}
          </div>
        )
      ) : data.reviews.length === 0 ? (
        <DashEmptyState art="star" meaning="customers" title={status === "pending" ? "You're all caught up" : `No ${tab.label.toLowerCase()} reviews`} description={tab.empty} />
      ) : (
        <ul className="space-y-3" aria-label={`${tab.label} reviews`}>
          {data.reviews.map((r) => (
            <li key={r.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-start gap-4">
                <span aria-hidden className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-slate-100 text-slate-400">
                  {r.productImage ? <img src={r.productImage} alt="" className="h-full w-full object-cover" /> : <Package className="h-5 w-5" />}
                </span>
                <div className="min-w-0 flex-1 space-y-1.5">
                  <p className="text-sm font-medium text-slate-900">{r.productName}</p>
                  <div className="flex flex-wrap items-center gap-2">
                    <Stars value={r.rating} />
                    {r.verified ? (
                      <DashPill tone="green">
                        <BadgeCheck className="mr-1 h-3.5 w-3.5" aria-hidden /> Verified purchase
                      </DashPill>
                    ) : (
                      <DashPill tone="slate">Added by your team</DashPill>
                    )}
                  </div>
                  {r.title ? <p className="font-semibold text-slate-900">{r.title}</p> : null}
                  {r.comment ? <p className="whitespace-pre-line text-sm text-slate-700">{r.comment}</p> : <p className="text-sm italic text-slate-500">No comment, just a rating.</p>}
                  {r.images.length ? (
                    <ul className="flex flex-wrap gap-2 pt-1" aria-label="Photos with this review">
                      {r.images.map((img, j) => (
                        <li key={img.url}>
                          <a href={img.url} target="_blank" rel="noopener noreferrer" className="block overflow-hidden rounded-lg border border-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-xyvoo-blue">
                            <img src={img.url} alt={`Customer photo ${j + 1}`} className="h-20 w-20 object-cover" />
                            <span className="sr-only"> (opens full size in a new tab)</span>
                          </a>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  <p className="text-xs text-slate-500">
                    {r.customerName} · {new Date(r.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                  </p>
                  {r.reply && replying?.id !== r.id ? (
                    <div className="mt-2 rounded-xl border-l-4 border-blue-300 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                      <span className="font-medium text-slate-900">Your reply: </span>
                      {r.reply}
                    </div>
                  ) : null}
                  {replying?.id === r.id ? (
                    <div className="mt-2 space-y-2">
                      <label htmlFor={`reply-${r.id}`} className="text-sm font-medium text-slate-800">
                        Your reply (shown under the review)
                      </label>
                      <textarea id={`reply-${r.id}`} className={dashInput} rows={3} maxLength={1000} value={replying.text} onChange={(e) => setReplying({ id: r.id, text: e.target.value })} />
                      <div className="flex gap-2">
                        <button type="button" onClick={saveReply} disabled={busy === r.id} className={dashButton.primary}>
                          {busy === r.id ? "Saving…" : "Save reply"}
                        </button>
                        <button type="button" onClick={() => setReplying(null)} className={dashButton.secondary}>
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : null}
                  {confirmDelete === r.id ? (
                    <p role="alert" className="text-sm text-red-800">
                      Delete this review for good? Hiding it keeps it in case you change your mind.
                    </p>
                  ) : null}
                </div>
                <div className="flex flex-wrap items-center gap-1 sm:flex-col sm:items-stretch">
                  {r.status !== "published" ? (
                    <button type="button" disabled={busy === r.id} onClick={() => act(r, "approve", "Review published. It's now on the product page.")} className={dashButton.primary}>
                      <Check className="h-4 w-4" aria-hidden /> {r.status === "hidden" ? "Show again" : "Approve"}
                    </button>
                  ) : null}
                  {r.status !== "hidden" ? (
                    <button type="button" disabled={busy === r.id} onClick={() => act(r, "hide", "Review hidden. Customers can't see it.")} className={dashButton.quiet}>
                      <EyeOff className="h-4 w-4" aria-hidden /> Hide
                    </button>
                  ) : null}
                  <button type="button" disabled={busy === r.id} onClick={() => setReplying({ id: r.id, text: r.reply ?? "" })} className={dashButton.quiet}>
                    <MessageSquareReply className="h-4 w-4" aria-hidden /> {r.reply ? "Edit reply" : "Reply"}
                  </button>
                  <button type="button" disabled={busy === r.id} onClick={() => act(r, "delete", "Review deleted.")} className={dashButton.danger}>
                    <Trash2 className="h-4 w-4" aria-hidden /> {confirmDelete === r.id ? "Yes, delete" : "Delete"}
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {data && data.pageCount > 1 ? (
        <div className="flex items-center justify-between">
          <button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)} className={dashButton.secondary}>
            Previous
          </button>
          <span className="text-sm text-slate-600">
            Page {data.page} of {data.pageCount}
          </span>
          <button type="button" disabled={page >= data.pageCount} onClick={() => setPage(page + 1)} className={dashButton.secondary}>
            Next
          </button>
        </div>
      ) : null}
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { Loader2, Star } from "lucide-react";
import { FEEDBACK_QUESTIONS, type FeedbackKey } from "@/lib/hms/stay-feedback-shared";
import { cn } from "@/lib/utils";

type Form = { hotel: string; guestName: string; answered: boolean };

function Stars({ label, value, onChange }: { label: string; value: number | null; onChange: (n: number) => void }) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium text-slate-900">{label}</legend>
      <div className="flex gap-1" role="radiogroup" aria-label={label}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={value === n}
            aria-label={`${n} out of 5`}
            onClick={() => onChange(n)}
            className="flex h-11 w-11 items-center justify-center rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            <Star className={cn("h-7 w-7", value != null && n <= value ? "fill-amber-400 text-amber-500" : "text-slate-300")} aria-hidden />
          </button>
        ))}
      </div>
    </fieldset>
  );
}

/** The page a guest opens from the link in their email or WhatsApp. */
export function StayFeedbackForm({ token }: { token: string }) {
  const url = `/api/hotel/feedback/${encodeURIComponent(token)}`;
  const [form, setForm] = useState<Form | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [ratings, setRatings] = useState<Partial<Record<FeedbackKey, number>>>({});
  const [recommend, setRecommend] = useState<boolean | null>(null);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    fetch(url, { cache: "no-store" })
      .then(async (r) => {
        const j = await r.json().catch(() => ({}));
        if (!r.ok) setProblem(j.error ?? "This link isn't right.");
        else setForm(j);
      })
      .catch(() => setProblem("Could not open this page. Check your connection and try again."));
  }, [url]);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...ratings, wouldRecommend: recommend, comment: comment.trim() || null }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(j.error ?? "Could not send your feedback.");
        return;
      }
      setDone(true);
    } finally {
      setBusy(false);
    }
  }

  if (problem) return <p role="alert" className="rounded-2xl border border-slate-200 bg-white p-6 text-slate-800">{problem}</p>;
  if (!form) return <Loader2 className="mx-auto h-6 w-6 animate-spin text-slate-500" aria-label="Loading" />;
  if (done || form.answered) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center">
        <h1 className="font-heading text-xl font-bold text-slate-900">Thank you</h1>
        <p className="mt-2 text-slate-700">
          {done ? `Your feedback has reached ${form.hotel}.` : `You have already sent your feedback to ${form.hotel}.`} We read every answer.
        </p>
      </div>
    );
  }

  return (
    <form
      className="space-y-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <div>
        <h1 className="font-heading text-xl font-bold text-slate-900">How was your stay at {form.hotel}?</h1>
        <p className="mt-1 text-sm text-slate-600">It takes under a minute. Only the first question is needed.</p>
      </div>

      {FEEDBACK_QUESTIONS.map((q) => (
        <Stars key={q.key} label={q.label} value={ratings[q.key] ?? null} onChange={(n) => setRatings((r) => ({ ...r, [q.key]: n }))} />
      ))}

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-slate-900">Would you stay with us again?</legend>
        <div className="flex gap-2">
          {([true, false] as const).map((v) => (
            <button
              key={String(v)}
              type="button"
              aria-pressed={recommend === v}
              onClick={() => setRecommend(v)}
              className={cn(
                "min-h-11 rounded-xl border px-5 text-sm font-medium",
                recommend === v ? "border-blue-500 bg-blue-50 text-blue-900" : "border-slate-200 bg-white text-slate-800",
              )}
            >
              {v ? "Yes" : "No"}
            </button>
          ))}
        </div>
      </fieldset>

      <div className="space-y-2">
        <label htmlFor="fb-comment" className="text-sm font-medium text-slate-900">
          Anything you would like us to know? (optional)
        </label>
        <textarea
          id="fb-comment"
          className="min-h-[110px] w-full rounded-xl border border-slate-300 bg-white p-3 text-sm text-slate-900"
          maxLength={1500}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
        />
      </div>

      {error ? <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p> : null}

      <button
        type="submit"
        disabled={busy || !ratings.overall}
        className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-blue-700 px-5 text-sm font-semibold text-white disabled:opacity-50"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
        Send feedback
      </button>
    </form>
  );
}

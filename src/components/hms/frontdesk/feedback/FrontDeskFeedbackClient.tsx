"use client";

import { useCallback, useEffect, useState } from "react";
import { ExternalLink, Loader2, MessageSquareHeart, Star } from "lucide-react";
import { HmsCard, HmsPage, HmsPageHeader, HmsPill, hmsButton } from "@/components/hms/hms-ui";
import { toastError, toastSuccess } from "@/lib/app-toast";
import { formatDateTime } from "@/lib/format-date";
import { FEEDBACK_QUESTIONS, isLowScore, type FeedbackSummary, type StayFeedback } from "@/lib/hms/stay-feedback-shared";

export function StarsRow({ value }: { value: number | null }) {
  if (value == null) return <span className="text-slate-500">–</span>;
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${value} out of 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} className={n <= value ? "h-3.5 w-3.5 fill-amber-400 text-amber-500" : "h-3.5 w-3.5 text-slate-300"} aria-hidden />
      ))}
    </span>
  );
}

function Row({ slug, f, onChanged }: { slug: string; f: StayFeedback; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const answered = f.submittedAt != null;

  async function resend(channel: "email" | "whatsapp") {
    setBusy(true);
    try {
      const res = await fetch("/api/hotel/frontdesk/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, reservationId: f.reservationId, channel }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toastError("Not sent", json.error ?? "Try again.");
        return;
      }
      if (json.link) setLink(json.link);
      else toastSuccess("Feedback link emailed");
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="space-y-2 px-3 py-3 text-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-medium text-slate-900">
            {f.guestName}
            {f.roomCode ? <span className="font-normal text-slate-600"> · Room {f.roomCode}</span> : null}
          </p>
          <p className="text-slate-600">
            {answered ? `Answered ${formatDateTime(f.submittedAt as string)}` : `Link sent ${formatDateTime(f.requestedAt)}${f.requestedChannel ? ` by ${f.requestedChannel}` : ""}`}
          </p>
        </div>
        {answered ? (
          <div className="flex items-center gap-2">
            {isLowScore(f) ? <HmsPill tone="red">Follow up</HmsPill> : null}
            <StarsRow value={f.overall} />
          </div>
        ) : (
          <HmsPill tone="slate">Waiting</HmsPill>
        )}
      </div>

      {answered ? (
        <>
          <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
            {FEEDBACK_QUESTIONS.filter((q) => q.key !== "overall").map((q) =>
              f[q.key] != null ? (
                <span key={q.key} className="inline-flex items-center gap-1">
                  {q.key === "cleanliness" ? "Clean" : q.key === "staff" ? "Team" : "Value"} <StarsRow value={f[q.key]} />
                </span>
              ) : null,
            )}
            {f.wouldRecommend != null ? <span>{f.wouldRecommend ? "Would stay again" : "Would not stay again"}</span> : null}
          </p>
          {f.comment ? <p className="rounded-lg bg-slate-50 p-3 text-slate-800">{f.comment}</p> : null}
        </>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className={hmsButton.secondary} disabled={busy} onClick={() => void resend("email")}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
            Send again by email
          </button>
          <button type="button" className={hmsButton.secondary} disabled={busy} onClick={() => void resend("whatsapp")}>
            WhatsApp
          </button>
          {link ? (
            <a href={link} target="_blank" rel="noopener noreferrer" className={hmsButton.secondary}>
              Open WhatsApp
              <ExternalLink className="h-3.5 w-3.5" aria-hidden />
            </a>
          ) : null}
        </div>
      )}
    </li>
  );
}

export function FrontDeskFeedbackClient({ slug }: { slug: string }) {
  const [rows, setRows] = useState<StayFeedback[]>([]);
  const [summary, setSummary] = useState<FeedbackSummary | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/hotel/frontdesk/feedback?slug=${encodeURIComponent(slug)}`, { cache: "no-store" });
      const json = await res.json();
      setRows(json.feedback ?? []);
      setSummary(json.summary ?? null);
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    void load();
  }, [load]);

  const answered = rows.filter((r) => r.submittedAt);
  const waiting = rows.filter((r) => !r.submittedAt);

  return (
    <HmsPage wide>
      <HmsPageHeader
        eyebrow="Front desk"
        meaning="guests"
        title="Guest feedback"
        description="A link goes to each guest by email when they check out. Their scores and comments are kept here and on their profile."
      />

      <HmsCard
        id="feedback-summary"
        icon={MessageSquareHeart}
        meaning="guests"
        title="How guests rate their stay"
        description={loading ? "Loading…" : summary && summary.answered > 0 ? `Based on ${summary.answered} answer${summary.answered === 1 ? "" : "s"}.` : "No answers yet."}
      >
        {loading || !summary ? (
          <Loader2 className="h-4 w-4 animate-spin text-slate-500" aria-label="Loading" />
        ) : (
          <dl className="grid gap-4 sm:grid-cols-4">
            <div>
              <dt className="text-xs text-slate-600">Average score</dt>
              <dd className="text-2xl font-bold text-slate-900">{summary.average != null ? `${summary.average} / 5` : "–"}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-600">Links sent</dt>
              <dd className="text-2xl font-bold text-slate-900">{summary.sent}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-600">Answered</dt>
              <dd className="text-2xl font-bold text-slate-900">{summary.responseRate}%</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-600">Need a follow-up</dt>
              <dd className="text-2xl font-bold text-slate-900">{summary.lowScores}</dd>
            </div>
          </dl>
        )}
      </HmsCard>

      <HmsCard id="feedback-answers" icon={MessageSquareHeart} meaning="guests" title="What guests said" description="Newest first. A score of 2 or less is marked for follow-up.">
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin text-slate-500" aria-label="Loading" />
        ) : answered.length === 0 ? (
          <p className="text-sm text-slate-600">Nobody has answered yet.</p>
        ) : (
          <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
            {answered.map((f) => (
              <Row key={f.id} slug={slug} f={f} onChanged={() => void load()} />
            ))}
          </ul>
        )}
      </HmsCard>

      {waiting.length > 0 ? (
        <HmsCard id="feedback-waiting" icon={MessageSquareHeart} meaning="guests" title="Not answered yet" description="Send the link again by email or WhatsApp.">
          <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
            {waiting.map((f) => (
              <Row key={f.id} slug={slug} f={f} onChanged={() => void load()} />
            ))}
          </ul>
        </HmsCard>
      ) : null}
    </HmsPage>
  );
}

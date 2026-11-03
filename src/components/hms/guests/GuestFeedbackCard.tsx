"use client";

import { useEffect, useState } from "react";
import { Loader2, MessageSquareHeart } from "lucide-react";
import { HmsCard } from "@/components/hms/hms-ui";
import { StarsRow } from "@/components/hms/frontdesk/feedback/FrontDeskFeedbackClient";
import { formatDateTime } from "@/lib/format-date";
import { summariseFeedback, type StayFeedback } from "@/lib/hms/stay-feedback-shared";

/** What this guest has said about their stays, with their average score. */
export function GuestFeedbackCard({ slug, guestId }: { slug: string; guestId: string }) {
  const [rows, setRows] = useState<StayFeedback[] | null>(null);

  useEffect(() => {
    fetch(`/api/hotel/frontdesk/feedback?slug=${encodeURIComponent(slug)}&guestId=${encodeURIComponent(guestId)}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { feedback: [] }))
      .then((j) => setRows(j.feedback ?? []))
      .catch(() => setRows([]));
  }, [slug, guestId]);

  const answered = (rows ?? []).filter((r) => r.submittedAt);
  const summary = summariseFeedback(rows ?? []);

  return (
    <HmsCard
      id="guest-feedback"
      icon={MessageSquareHeart}
      meaning="guests"
      title="Feedback"
      description={summary.average != null ? `Average ${summary.average} out of 5 from ${summary.answered} stay${summary.answered === 1 ? "" : "s"}.` : "What this guest says about their stays."}
    >
      {rows === null ? (
        <Loader2 className="h-4 w-4 animate-spin text-slate-500" aria-label="Loading" />
      ) : answered.length === 0 ? (
        <p className="text-sm text-slate-600">No feedback yet. A link is sent by email when they check out.</p>
      ) : (
        <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 text-sm">
          {answered.map((f) => (
            <li key={f.id} className="space-y-1 px-3 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-slate-600">{formatDateTime(f.submittedAt as string)}</span>
                <StarsRow value={f.overall} />
              </div>
              {f.comment ? <p className="text-slate-800">{f.comment}</p> : null}
            </li>
          ))}
        </ul>
      )}
    </HmsCard>
  );
}

/* Browser-safe parts of stay feedback: the questions, the numbers worked out from answers, wording. */

export const FEEDBACK_QUESTIONS = [
  { key: "overall", label: "Your stay overall" },
  { key: "cleanliness", label: "How clean was your room?" },
  { key: "staff", label: "How helpful was our team?" },
  { key: "value", label: "Was it worth the price?" },
] as const;
export type FeedbackKey = (typeof FEEDBACK_QUESTIONS)[number]["key"];

export type StayFeedback = {
  id: string;
  reservationId: string;
  guestId: string | null;
  guestName: string;
  roomCode: string | null;
  requestedAt: string;
  requestedChannel: string | null;
  submittedAt: string | null;
  overall: number | null;
  cleanliness: number | null;
  staff: number | null;
  value: number | null;
  wouldRecommend: boolean | null;
  comment: string | null;
};

/** A score at or below this needs someone to follow up. */
export const LOW_SCORE = 2;

export function isLowScore(f: Pick<StayFeedback, "overall" | "submittedAt">) {
  return f.submittedAt != null && f.overall != null && f.overall <= LOW_SCORE;
}

export type FeedbackSummary = {
  sent: number;
  answered: number;
  /** Share of sent links that were answered, 0 to 100. */
  responseRate: number;
  /** Average overall score to one decimal, or null with no answers. */
  average: number | null;
  /** Count of answers for 1 to 5 stars. */
  distribution: [number, number, number, number, number];
  lowScores: number;
};

export function summariseFeedback(rows: Pick<StayFeedback, "overall" | "submittedAt">[]): FeedbackSummary {
  const answered = rows.filter((r) => r.submittedAt && r.overall != null);
  const distribution: FeedbackSummary["distribution"] = [0, 0, 0, 0, 0];
  let total = 0;
  for (const r of answered) {
    const s = Math.min(5, Math.max(1, Math.round(r.overall as number)));
    distribution[s - 1] += 1;
    total += s;
  }
  return {
    sent: rows.length,
    answered: answered.length,
    responseRate: rows.length === 0 ? 0 : Math.round((answered.length / rows.length) * 100),
    average: answered.length === 0 ? null : Math.round((total / answered.length) * 10) / 10,
    distribution,
    lowScores: answered.filter((r) => (r.overall as number) <= LOW_SCORE).length,
  };
}

/** Keeps a rating to a whole number from 1 to 5, or null. */
export function cleanRating(v: unknown): number | null {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return null;
  const r = Math.round(n);
  return r >= 1 && r <= 5 ? r : null;
}

export function feedbackMessage(params: { name: string; hotel: string; url: string }) {
  const first = params.name.replace(/^(mr|mrs|ms|miss|dr|prof|chief)\.?\s+/i, "").split(/\s+/)[0] || "there";
  return [
    `Hello ${first},`,
    "",
    `Thank you for staying at ${params.hotel}. How was your stay? It takes under a minute:`,
    params.url,
  ].join("\n");
}

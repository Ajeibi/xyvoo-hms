/* Browser-safe parts of online check-in: who must add ID, when the link is due, what is owed. */

export const ID_POLICIES = ["all", "foreign", "none"] as const;
export type IdPolicy = (typeof ID_POLICIES)[number];

export const ID_POLICY_LABELS: Record<IdPolicy, string> = {
  all: "Every guest",
  foreign: "Only guests from another country",
  none: "Nobody",
};

/** Until the hotel chooses, only guests from another country are asked for ID. */
export const DEFAULT_ID_POLICY: IdPolicy = "foreign";
export const DEFAULT_DAYS_BEFORE = 2;

export const ARRIVAL_TIMES = ["Before noon", "12:00 to 15:00", "15:00 to 18:00", "18:00 to 21:00", "After 21:00"] as const;

/** True when this guest must add an ID photo before arriving. */
export function idRequired(policy: IdPolicy, guestCountry: string | null, hotelCountry: string): boolean {
  if (policy === "none") return false;
  if (policy === "all") return true;
  if (!guestCountry) return true; // Not knowing where they are from, ask.
  return guestCountry.trim().toUpperCase() !== hotelCountry.trim().toUpperCase();
}

/** Whole days from today to the arrival date (negative once it has passed). */
export function daysUntil(arrivalAt: string, now: Date = new Date()): number {
  const a = new Date(arrivalAt);
  const start = Date.UTC(a.getUTCFullYear(), a.getUTCMonth(), a.getUTCDate());
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.round((start - today) / 86400000);
}

/** The link is due once arrival is within `daysBefore` days, and until the guest arrives. */
export function onlineCheckInDue(arrivalAt: string, daysBefore: number, now: Date = new Date()): boolean {
  const d = daysUntil(arrivalAt, now);
  return d >= 0 && d <= daysBefore;
}

/** What the guest still owes as a deposit before arrival (never below zero). */
export function depositDue(preauth: number | null, paid: number): number {
  if (!preauth || preauth <= 0) return 0;
  return Math.max(0, Math.round((preauth - Math.max(0, paid)) * 100) / 100);
}

export type OnlineCheckInStatus = "not_sent" | "sent" | "completed";

export type OnlineCheckIn = {
  status: OnlineCheckInStatus;
  requestedAt: string | null;
  requestedChannel: string | null;
  submittedAt: string | null;
  phone: string | null;
  email: string | null;
  nationality: string | null;
  arrivalTime: string | null;
  requests: string | null;
  idRequired: boolean;
  signed: boolean;
  idPhotos: number;
};

export const ONLINE_CHECKIN_STATUS_LABEL: Record<OnlineCheckInStatus, string> = {
  not_sent: "Not sent",
  sent: "Link sent",
  completed: "Done online",
};

export function onlineCheckInMessage(params: { name: string; hotel: string; url: string; arrivalLabel: string }) {
  const first = params.name.replace(/^(mr|mrs|ms|miss|dr|prof|chief)\.?\s+/i, "").split(/\s+/)[0] || "there";
  return [
    `Hello ${first},`,
    "",
    `We look forward to welcoming you to ${params.hotel} on ${params.arrivalLabel}. Save time at the desk by checking in online: confirm your details and sign here.`,
    params.url,
  ].join("\n");
}

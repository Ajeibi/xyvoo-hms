/* Browser-safe parts of the night audit settings (no server imports). */

export type NoShowMode = "mark_only" | "keep_deposit" | "policy";

export const NO_SHOW_MODE_LABEL: Record<NoShowMode, string> = {
  mark_only: "Only mark them as no-shows",
  keep_deposit: "Mark them and keep any deposit paid",
  policy: "Mark them, keep any deposit paid and charge what the deposit policy asks for",
};

export type NightAuditSettings = {
  startDate: string | null;
  autoRun: boolean;
  autoRunHour: number;
  processNoShows: boolean;
  noShowMode: NoShowMode;
  emailReport: boolean;
  extraRecipients: string;
  /** Book each stay's room charge to Deferred Revenue and earn it night by night. */
  nightlyRoomRevenue: boolean;
  /** The first business date this applied from. Set by the audit; once set, it stays on. */
  nightlyRevenueFrom: string | null;
};

export const DEFAULT_NIGHT_AUDIT_SETTINGS: NightAuditSettings = {
  nightlyRoomRevenue: true,
  nightlyRevenueFrom: null,
  startDate: null,
  autoRun: false,
  autoRunHour: 3,
  processNoShows: true,
  noShowMode: "policy",
  emailReport: true,
  extraRecipients: "",
};

export const EMAIL_RE = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;

/** Splits "a@x.com, b@y.com" into the valid addresses; anything else is dropped. */
export function parseRecipients(raw: string | null | undefined): string[] {
  return [...new Set((raw ?? "").split(/[,;\s]+/).map((e) => e.trim().toLowerCase()).filter((e) => EMAIL_RE.test(e)))];
}


import type { ConsentChannel } from "@/lib/hms/guest-consent-shared";

/*
 * Guest segments: a group of guests picked by rules (VIPs, big spenders, people who haven't been
 * back for a year…). The ready-made ones are listed here; hotels can save their own. The rules
 * are checked against plain facts about each guest, so this is safe for the browser and the server
 * and easy to test.
 */

export type SegmentRules = {
  vip?: boolean;
  /** At least this many completed stays. */
  minStays?: number;
  /** No more than this many completed stays. */
  maxStays?: number;
  minSpend?: number;
  maxSpend?: number;
  /** Their last stay ended within this many days. */
  lastStayWithinDays?: number;
  /** Their last stay ended more than this many days ago (and they have stayed before). */
  lastStayOlderThanDays?: number;
  /** "NG" for one country, "foreign" for anyone not from Nigeria. */
  nationality?: string;
  /** 1 to 12, or "this" for the current month. */
  birthdayMonth?: number | "this";
  hasCompany?: boolean;
  /** Agreed to marketing on this channel, or on any channel. */
  consent?: ConsentChannel | "any";
  tier?: string;
  /** On the books but never stayed (no completed or current stay). */
  neverStayed?: boolean;
};

/** The facts about one guest the rules look at. */
export type SegmentGuest = {
  id: string;
  name: string;
  email: string;
  phone: string;
  nationality: string;
  dateOfBirth: string | null;
  tags: string[];
  isVip: boolean;
  companyId: string | null;
  anonymised: boolean;
  consent: Record<ConsentChannel, boolean>;
  completedStays: number;
  staysStarted: number;
  spend: number;
  lastStayAt: string | null;
  tier: string | null;
  loyaltyBalance: number;
};

export type BuiltInSegment = { key: string; label: string; description: string; rules: SegmentRules };

/** Spend that counts as a "big spender", in the hotel's currency. A hotel can build its own with any amount. */
export const BIG_SPENDER_DEFAULT = 500000;

export const BUILT_IN_SEGMENTS: BuiltInSegment[] = [
  { key: "builtin:vip", label: "VIP guests", description: "Marked VIP, or booked as a VIP before.", rules: { vip: true } },
  { key: "builtin:first-time", label: "First-time guests", description: "One stay so far.", rules: { minStays: 1, maxStays: 1 } },
  { key: "builtin:repeat", label: "Repeat guests", description: "Stayed two or more times.", rules: { minStays: 2 } },
  { key: "builtin:big-spenders", label: "Big spenders", description: `Billed ${BIG_SPENDER_DEFAULT.toLocaleString("en-NG")} or more in all.`, rules: { minSpend: BIG_SPENDER_DEFAULT } },
  { key: "builtin:recent", label: "Stayed in the last 90 days", description: "Recent guests, good to thank or ask for a review.", rules: { lastStayWithinDays: 90 } },
  { key: "builtin:lapsed", label: "Haven't been back in a year", description: "Stayed before, but not for over 12 months.", rules: { lastStayOlderThanDays: 365 } },
  { key: "builtin:birthdays", label: "Birthdays this month", description: "A reason to get in touch.", rules: { birthdayMonth: "this" } },
  { key: "builtin:foreign", label: "Guests from abroad", description: "Not from Nigeria.", rules: { nationality: "foreign" } },
  { key: "builtin:corporate", label: "Travelling for a company", description: "Linked to a company profile.", rules: { hasCompany: true } },
  { key: "builtin:marketing", label: "Agreed to offers", description: "Said yes to marketing on at least one channel.", rules: { consent: "any" } },
  { key: "builtin:never-stayed", label: "Never stayed", description: "On the books with no completed stay.", rules: { neverStayed: true } },
];

const DAY = 86_400_000;

/** True if the guest fits every rule that is set. Erased guests never match. */
export function matchesRules(rules: SegmentRules, g: SegmentGuest, now = new Date()): boolean {
  if (g.anonymised) return false;
  if (rules.vip !== undefined && g.isVip !== rules.vip) return false;
  if (rules.minStays !== undefined && g.completedStays < rules.minStays) return false;
  if (rules.maxStays !== undefined && g.completedStays > rules.maxStays) return false;
  if (rules.minSpend !== undefined && g.spend < rules.minSpend) return false;
  if (rules.maxSpend !== undefined && g.spend > rules.maxSpend) return false;
  if (rules.lastStayWithinDays !== undefined) {
    if (!g.lastStayAt) return false;
    if (now.getTime() - new Date(g.lastStayAt).getTime() > rules.lastStayWithinDays * DAY) return false;
  }
  if (rules.lastStayOlderThanDays !== undefined) {
    if (!g.lastStayAt) return false;
    if (now.getTime() - new Date(g.lastStayAt).getTime() <= rules.lastStayOlderThanDays * DAY) return false;
  }
  if (rules.nationality) {
    const n = g.nationality.trim().toUpperCase();
    if (rules.nationality === "foreign") {
      if (!n || n === "NG" || n === "XX") return false;
    } else if (n !== rules.nationality.trim().toUpperCase()) return false;
  }
  if (rules.birthdayMonth !== undefined) {
    if (!g.dateOfBirth) return false;
    const month = Number(g.dateOfBirth.slice(5, 7));
    const want = rules.birthdayMonth === "this" ? now.getMonth() + 1 : rules.birthdayMonth;
    if (month !== want) return false;
  }
  if (rules.hasCompany !== undefined && Boolean(g.companyId) !== rules.hasCompany) return false;
  if (rules.consent) {
    const ok = rules.consent === "any" ? g.consent.email || g.consent.sms || g.consent.whatsapp : g.consent[rules.consent];
    if (!ok) return false;
  }
  if (rules.tier && (g.tier ?? "").toLowerCase() !== rules.tier.toLowerCase()) return false;
  if (rules.neverStayed && g.staysStarted > 0) return false;
  return true;
}

/** A sentence describing the rules, for saved segments. */
export function describeRules(rules: SegmentRules): string {
  const parts: string[] = [];
  if (rules.vip) parts.push("VIP");
  if (rules.minStays !== undefined && rules.maxStays !== undefined) parts.push(`${rules.minStays} to ${rules.maxStays} stays`);
  else if (rules.minStays !== undefined) parts.push(`${rules.minStays}+ stays`);
  else if (rules.maxStays !== undefined) parts.push(`up to ${rules.maxStays} stays`);
  if (rules.minSpend !== undefined) parts.push(`spent ${rules.minSpend.toLocaleString("en-NG")}+`);
  if (rules.maxSpend !== undefined) parts.push(`spent up to ${rules.maxSpend.toLocaleString("en-NG")}`);
  if (rules.lastStayWithinDays !== undefined) parts.push(`stayed in the last ${rules.lastStayWithinDays} days`);
  if (rules.lastStayOlderThanDays !== undefined) parts.push(`not back for ${rules.lastStayOlderThanDays}+ days`);
  if (rules.nationality) parts.push(rules.nationality === "foreign" ? "from abroad" : `from ${rules.nationality.toUpperCase()}`);
  if (rules.birthdayMonth !== undefined) parts.push(rules.birthdayMonth === "this" ? "birthday this month" : `birthday in month ${rules.birthdayMonth}`);
  if (rules.hasCompany) parts.push("linked to a company");
  if (rules.consent) parts.push(rules.consent === "any" ? "agreed to offers" : `agreed to ${rules.consent} offers`);
  if (rules.tier) parts.push(`${rules.tier} tier`);
  if (rules.neverStayed) parts.push("never stayed");
  return parts.length > 0 ? parts.join(" · ") : "Everyone";
}

/** Cleans rules that arrive from a form or the network: keeps only known keys with sensible values. */
export function sanitizeRules(raw: unknown): SegmentRules {
  if (!raw || typeof raw !== "object") return {};
  const r = raw as Record<string, unknown>;
  const out: SegmentRules = {};
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : undefined);
  if (typeof r.vip === "boolean") out.vip = r.vip;
  for (const k of ["minStays", "maxStays", "minSpend", "maxSpend", "lastStayWithinDays", "lastStayOlderThanDays"] as const) {
    const v = num(r[k]);
    if (v !== undefined) out[k] = v;
  }
  if (typeof r.nationality === "string" && r.nationality.trim()) out.nationality = r.nationality.trim().slice(0, 7);
  if (r.birthdayMonth === "this") out.birthdayMonth = "this";
  else if (typeof r.birthdayMonth === "number" && r.birthdayMonth >= 1 && r.birthdayMonth <= 12) out.birthdayMonth = Math.trunc(r.birthdayMonth);
  if (typeof r.hasCompany === "boolean") out.hasCompany = r.hasCompany;
  if (r.consent === "any" || r.consent === "email" || r.consent === "sms" || r.consent === "whatsapp") out.consent = r.consent;
  if (typeof r.tier === "string" && r.tier.trim()) out.tier = r.tier.trim().slice(0, 40);
  if (r.neverStayed === true) out.neverStayed = true;
  return out;
}

const validEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

/** Who an emailed offer to this group would reach: agreed to email, has a working address, not erased. */
export function emailableMembers(pool: SegmentGuest[], rules: SegmentRules, now = new Date()) {
  return pool.filter((g) => !g.anonymised && g.consent.email && validEmail(g.email) && matchesRules(rules, g, now));
}

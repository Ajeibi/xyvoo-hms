import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase/server";

/*
 * Store analytics. The storefront sends events only after the visitor accepts
 * analytics cookies (StoreAnalytics.tsx). Nothing here stores IP addresses,
 * names or contact details: a random visitor id, a session id, and what they
 * did. Raw events are deleted after 28 days (store.purge_old_analytics).
 */

export const EVENT_TYPES = [
  "page_view",
  "product_view",
  "search",
  "add_to_cart",
  "remove_from_cart",
  "checkout_started",
  "checkout_details",
  "payment_started",
  "app_installed",
] as const;
export type StoreEventType = (typeof EVENT_TYPES)[number];

const shortText = (max: number) => z.string().trim().max(max);
const id = z.string().regex(/^[A-Za-z0-9_-]{8,64}$/);

export const eventSchema = z.object({
  type: z.enum(EVENT_TYPES),
  path: shortText(300).regex(/^\//).optional(),
  productId: z.string().uuid().optional(),
  quantity: z.number().int().min(-1000).max(1000).optional(),
  value: z.number().min(0).max(100_000_000).optional(),
  searchTerm: shortText(100).optional(),
});

export const eventBatchSchema = z.object({
  visitorId: id,
  sessionId: id,
  isApp: z.boolean().default(false),
  referrer: shortText(500).optional(),
  utm: z
    .object({ source: shortText(60).optional(), medium: shortText(60).optional(), campaign: shortText(100).optional() })
    .default({}),
  events: z.array(eventSchema).min(1).max(25),
});
export type EventBatch = z.infer<typeof eventBatchSchema>;

const BOT_PATTERN = /bot|crawl|spider|slurp|preview|facebookexternalhit|whatsapp|headless|lighthouse|pingdom|monitor|curl|wget|python|axios|node-fetch/i;

export function isBot(userAgent: string | null) {
  return !userAgent || BOT_PATTERN.test(userAgent);
}

export function deviceFromUserAgent(userAgent: string | null): "mobile" | "tablet" | "desktop" {
  const ua = userAgent || "";
  if (/iPad|Tablet|PlayBook|Silk|(Android(?!.*Mobile))/i.test(ua)) return "tablet";
  if (/Mobi|iPhone|iPod|Android.*Mobile|Opera Mini|IEMobile/i.test(ua)) return "mobile";
  return "desktop";
}

/** The referring site's host, or null for direct visits and links within the store itself. */
export function referrerHost(referrer: string | undefined, ownHost: string | null) {
  if (!referrer) return null;
  try {
    const host = new URL(referrer).hostname.replace(/^www\./, "").toLowerCase();
    const own = (ownHost || "").split(":")[0].replace(/^www\./, "").toLowerCase();
    if (!host || host === own) return null;
    // Group the big apps' many hostnames under one name.
    if (/(^|\.)instagram\.com$/.test(host)) return "instagram";
    if (/(^|\.)(facebook\.com|fb\.com|fb\.me|m\.facebook\.com|l\.facebook\.com)$/.test(host)) return "facebook";
    if (/(^|\.)(whatsapp\.com|wa\.me)$/.test(host)) return "whatsapp";
    if (/(^|\.)(t\.co|twitter\.com|x\.com)$/.test(host)) return "x";
    if (/(^|\.)tiktok\.com$/.test(host)) return "tiktok";
    if (/(^|\.)google\.[a-z.]+$/.test(host)) return "google";
    return host.slice(0, 100);
  } catch {
    return null;
  }
}

export async function ingestEvents(
  tenantId: string,
  batch: EventBatch,
  context: { userAgent: string | null; country: string | null; host: string | null },
) {
  const device = deviceFromUserAgent(context.userAgent);
  const referrer = referrerHost(batch.referrer, context.host);
  const rows = batch.events.map((e) => ({
    tenant_id: tenantId,
    visitor_id: batch.visitorId,
    session_id: batch.sessionId,
    type: e.type,
    path: e.path ?? null,
    product_id: e.productId ?? null,
    quantity: e.quantity ?? null,
    value: e.value ?? null,
    search_term: e.searchTerm?.toLowerCase() || null,
    referrer_host: referrer,
    utm_source: batch.utm.source?.toLowerCase() || null,
    utm_medium: batch.utm.medium?.toLowerCase() || null,
    utm_campaign: batch.utm.campaign || null,
    device,
    is_app: batch.isApp,
    country: context.country && /^[A-Z]{2}$/.test(context.country) ? context.country : null,
  }));
  const { error } = await createServerSupabaseClient().schema("store").from("events").insert(rows);
  if (error) throw new Error(error.message);
}

// ------------------------------------------------------------------ reports

export const ANALYTICS_RANGES = { today: 1, "7d": 7, "28d": 28 } as const;
export type AnalyticsRange = keyof typeof ANALYTICS_RANGES;

const COUNTRY_TIMEZONES: Record<string, string> = { NG: "Africa/Lagos", GH: "Africa/Accra", KE: "Africa/Nairobi", ZA: "Africa/Johannesburg" };
export const storeTimezone = (countryCode: string | null | undefined) => COUNTRY_TIMEZONES[countryCode || ""] || "Africa/Lagos";

/** Start of "today" in the store's timezone, as a UTC instant. */
export function startOfDayIn(timezone: string, now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const localAsUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  const offset = localAsUtc - Math.floor(now.getTime() / 1000) * 1000;
  return new Date(Date.UTC(get("year"), get("month") - 1, get("day")) - offset);
}

/** The current period and the one before it, for "compared with the previous N days". */
export function rangeWindows(range: AnalyticsRange, timezone: string, now = new Date()) {
  const days = ANALYTICS_RANGES[range];
  const to = now;
  const from = new Date(startOfDayIn(timezone, now).getTime() - (days - 1) * 86_400_000);
  const previousFrom = new Date(from.getTime() - days * 86_400_000);
  // Today vs the same part of yesterday; longer ranges vs the full previous period.
  const previousTo = range === "today" ? new Date(now.getTime() - 86_400_000) : from;
  return { from, to, previousFrom, previousTo };
}

/** How far a timezone is ahead of UTC at a given instant, in milliseconds. */
function timezoneOffset(timezone: string, at: Date) {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(at);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const localAsUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return localAsUtc - Math.floor(at.getTime() / 1000) * 1000;
}

/** Midnight at the start of a calendar date ("2026-09-01") in the store's timezone, as a UTC instant. */
export function startOfDateIn(date: string, timezone: string) {
  const [y, m, d] = date.split("-").map(Number);
  const guess = Date.UTC(y, m - 1, d);
  const first = guess - timezoneOffset(timezone, new Date(guess));
  return new Date(guess - timezoneOffset(timezone, new Date(first)));
}

/** Today's date in the store's timezone, as "YYYY-MM-DD". */
export function todayIn(timezone: string, now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
export const MAX_CUSTOM_RANGE_DAYS = 366;

function isRealDate(value: string) {
  if (!ISO_DATE.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d && y >= 2000;
}

/**
 * A custom period chosen with from/to dates (both included, in the store's
 * timezone), and the period of the same length just before it. Returns an
 * error message in plain words when the dates can't be used.
 */
export type ReportWindows = { from: Date; to: Date; previousFrom: Date; previousTo: Date; days: number; fromDate: string; toDate: string };

export function customRangeWindows(fromDate: string, toDate: string, timezone: string, now = new Date()): ReportWindows | { error: string } {
  if (!isRealDate(fromDate) || !isRealDate(toDate)) return { error: "Choose a start date and an end date." };
  if (fromDate > toDate) return { error: "The start date needs to be on or before the end date." };
  const today = todayIn(timezone, now);
  if (fromDate > today) return { error: "The start date can't be in the future." };
  const lastDay = toDate > today ? today : toDate;
  const from = startOfDateIn(fromDate, timezone);
  const dayAfter = new Date(Date.UTC(+lastDay.slice(0, 4), +lastDay.slice(5, 7) - 1, +lastDay.slice(8, 10) + 1)).toISOString().slice(0, 10);
  const end = startOfDateIn(dayAfter, timezone);
  const to = end > now ? now : end;
  const days = Math.round((end.getTime() - from.getTime()) / 86_400_000);
  if (days > MAX_CUSTOM_RANGE_DAYS) return { error: "Choose a period of a year or less." };
  return { from, to, previousFrom: new Date(from.getTime() - days * 86_400_000), previousTo: from, days, fromDate, toDate: lastDay };
}

/**
 * The period a report request asks for: ?from=&to= dates, or ?range=.
 * Shared by the analytics page and its downloads.
 */
export function windowsFromParams(params: URLSearchParams, timezone: string, now = new Date()): (ReportWindows & { range: AnalyticsRange | "custom" }) | { error: string } {
  const fromDate = params.get("from");
  const toDate = params.get("to");
  if (fromDate || toDate) {
    const custom = customRangeWindows(fromDate || "", toDate || "", timezone, now);
    if ("error" in custom) return custom;
    return { ...custom, range: "custom" as const };
  }
  const rangeParam = params.get("range") || "7d";
  const range: AnalyticsRange = rangeParam in ANALYTICS_RANGES ? (rangeParam as AnalyticsRange) : "7d";
  const w = rangeWindows(range, timezone, now);
  return { ...w, range, days: ANALYTICS_RANGES[range], fromDate: todayIn(timezone, w.from), toDate: todayIn(timezone, now) };
}

export type AnalyticsSummary = {
  visitors: number;
  sessions: number;
  pageViews: number;
  productViews: number;
  searches: number;
  cartSessions: number;
  checkoutSessions: number;
  detailsSessions: number;
  paymentSessions: number;
  appSessions: number;
  appInstalls: number;
  orders: number;
  paidOrders: number;
  revenue: number;
};

const n = (v: unknown) => Number(v ?? 0) || 0;

export async function getAnalyticsSummary(tenantId: string, from: Date, to: Date): Promise<AnalyticsSummary> {
  const { data, error } = await createServerSupabaseClient()
    .schema("store")
    .rpc("analytics_summary", { p_tenant: tenantId, p_from: from.toISOString(), p_to: to.toISOString() })
    .single();
  if (error) throw new Error(error.message);
  const r = (data || {}) as Record<string, unknown>;
  return {
    visitors: n(r.visitors),
    sessions: n(r.sessions),
    pageViews: n(r.page_views),
    productViews: n(r.product_views),
    searches: n(r.searches),
    cartSessions: n(r.cart_sessions),
    checkoutSessions: n(r.checkout_sessions),
    detailsSessions: n(r.details_sessions),
    paymentSessions: n(r.payment_sessions),
    appSessions: n(r.app_sessions),
    appInstalls: n(r.app_installs),
    orders: n(r.orders),
    paidOrders: n(r.paid_orders),
    revenue: n(r.revenue),
  };
}

type Rows = Record<string, unknown>[];

async function rpcRows(fn: string, args: Record<string, unknown>): Promise<Rows> {
  const { data, error } = await createServerSupabaseClient().schema("store").rpc(fn, args);
  if (error) throw new Error(error.message);
  return (data || []) as Rows;
}

export async function getAnalyticsDetail(tenantId: string, from: Date, to: Date, timezone: string) {
  const window = { p_tenant: tenantId, p_from: from.toISOString(), p_to: to.toISOString() };
  const [daily, products, sources, devices, opens] = await Promise.all([
    rpcRows("analytics_daily", { ...window, p_tz: timezone }),
    rpcRows("analytics_products", { ...window, p_limit: 10 }),
    rpcRows("analytics_sources", window),
    rpcRows("analytics_devices", window),
    rpcRows("analytics_notification_opens", window),
  ]);
  return {
    daily: daily.map((d) => ({ day: String(d.day), visitors: n(d.visitors), paidOrders: n(d.paid_orders), revenue: n(d.revenue) })),
    products: products.map((p) => ({ productId: String(p.product_id), name: String(p.name), views: n(p.views), cartAdds: n(p.cart_adds), unitsSold: n(p.units_sold), revenue: n(p.revenue) })),
    sources: sources.map((s) => ({ source: String(s.source), sessions: n(s.sessions), checkoutSessions: n(s.checkout_sessions), paidOrders: n(s.paid_orders), revenue: n(s.revenue) })),
    devices: devices.map((d) => ({ device: String(d.device), isApp: Boolean(d.is_app), sessions: n(d.sessions) })),
    notificationOpens: opens.map((o) => ({ campaign: String(o.campaign), sessions: n(o.sessions) })),
  };
}

/** Percentage change, or null when there's nothing to compare with. */
export function percentChange(current: number, previous: number) {
  if (!previous) return null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

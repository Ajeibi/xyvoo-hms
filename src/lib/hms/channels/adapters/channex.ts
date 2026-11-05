import { createHmac, timingSafeEqual } from "node:crypto";
import type {
  AriUpdate,
  ChannelConnectionRef,
  ChannelProvider,
  InboundBooking,
  InboundRoom,
  InboundStatus,
  MappingTargets,
  PushResult,
  WebhookEvent,
} from "../types";

/*
 * The only file that knows Channex. Written from Channex's public documentation (docs.channex.io):
 * REST + JSON, header `user-api-key`, availability at POST /availability, rates and restrictions at
 * POST /restrictions, bookings from GET /booking_revisions/feed which we must acknowledge with
 * POST /booking_revisions/:id/ack, webhooks signed with HMAC-SHA256 over "<timestamp>.<raw body>".
 * Switching provider means writing a sibling of this file and registering it in ./index.ts.
 *
 * Things to check against the real sandbox (marked VERIFY): feed paging parameters, the exact
 * webhook payload field names, and the signature header format.
 */

type Json = Record<string, unknown>;
type FetchLike = (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) => Promise<{ ok: boolean; status: number; headers: { get(name: string): string | null }; text(): Promise<string> }>;

export type ChannexOptions = {
  apiKey?: string;
  baseUrl?: string;
  webhookSecret?: string;
  fetchImpl?: FetchLike;
};

const str = (v: unknown) => (typeof v === "string" ? v : typeof v === "number" ? String(v) : "");
const num = (v: unknown) => {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};
const obj = (v: unknown): Json => (v && typeof v === "object" && !Array.isArray(v) ? (v as Json) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

/** Channex wants amounts as text with two decimals. */
export const channexMoney = (n: number) => (Math.round(n * 100) / 100).toFixed(2);

/** Turns one Channex booking revision into our neutral booking. Exported so tests can feed it samples. */
export function parseChannexRevision(id: string, attrs: Json): InboundBooking | null {
  const status = str(attrs.status) as InboundStatus;
  if (status !== "new" && status !== "modified" && status !== "cancelled") return null;
  const customer = obj(attrs.customer);
  const arrival = str(attrs.arrival_date);
  const departure = str(attrs.departure_date);
  const rooms: InboundRoom[] = arr(attrs.rooms).map((raw) => {
    const r = obj(raw);
    const days: Record<string, number> = {};
    for (const [d, v] of Object.entries(obj(r.days))) {
      const n = num(v);
      if (n !== null) days[d] = n;
    }
    const occ = obj(r.occupancy);
    const sum = Object.values(days).reduce((s, n) => s + n, 0);
    return {
      externalRoomTypeId: str(r.room_type_id),
      externalRatePlanId: str(r.rate_plan_id) || null,
      arrival: str(r.checkin_date) || arrival,
      departure: str(r.checkout_date) || departure,
      adults: Math.max(1, num(occ.adults) ?? 1),
      children: Math.max(0, (num(occ.children) ?? 0) + (num(occ.infants) ?? 0)),
      amount: num(r.amount) ?? (sum > 0 ? Math.round(sum * 100) / 100 : null),
      days,
      channelRoomRef: str(r.ota_unique_id) || null,
    };
  });
  const collect = str(attrs.payment_collect);
  const fullName = str(customer.name);
  const surname = str(customer.surname);
  // Some channels send only one name field.
  const [first, ...rest] = fullName.trim().split(/\s+/);
  return {
    revisionId: id,
    bookingRef: str(attrs.booking_id) || id,
    channelReservationCode: str(attrs.ota_reservation_code) || str(attrs.unique_id) || null,
    channelName: str(attrs.ota_name) || "Booking site",
    status,
    externalPropertyId: str(attrs.property_id),
    arrival,
    departure,
    currency: str(attrs.currency) || null,
    amount: num(attrs.amount),
    commission: num(attrs.ota_commission),
    paymentCollect: collect === "ota" ? "channel" : collect === "property" ? "property" : null,
    guest: {
      firstName: surname ? fullName.trim() || "Guest" : first || "Guest",
      lastName: surname || rest.join(" ") || "(channel guest)",
      email: str(customer.mail),
      phone: str(customer.phone),
      country: str(customer.country) || null,
    },
    notes: str(attrs.notes) || null,
    rooms,
  };
}

export function createChannexProvider(opts: ChannexOptions = {}): ChannelProvider {
  const apiKey = () => opts.apiKey ?? process.env.CHANNEX_API_KEY ?? "";
  // Staging until the user sets CHANNEX_BASE_URL to the production address after certification.
  const baseUrl = () => (opts.baseUrl ?? process.env.CHANNEX_BASE_URL ?? "https://staging.channex.io/api/v1").replace(/\/+$/, "");
  const secret = () => opts.webhookSecret ?? process.env.CHANNEX_WEBHOOK_SECRET ?? "";
  const doFetch: FetchLike = opts.fetchImpl ?? ((url, init) => fetch(url, init) as unknown as ReturnType<FetchLike>);

  async function call(method: "GET" | "POST", path: string, body?: unknown) {
    try {
      const res = await doFetch(`${baseUrl()}${path}`, {
        method,
        headers: { "user-api-key": apiKey(), "content-type": "application/json", accept: "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const text = await res.text();
      let json: Json = {};
      try {
        json = text ? (JSON.parse(text) as Json) : {};
      } catch {
        /* a non-JSON body (an HTML error page) falls through to the status check */
      }
      return { ok: res.ok, status: res.status, json, retryAfter: Number(res.headers.get("retry-after")) || undefined };
    } catch (e) {
      return { ok: false, status: 0, json: { error: e instanceof Error ? e.message : "network error" } as Json, retryAfter: undefined };
    }
  }

  const failText = (r: { status: number; json: Json }) => {
    const errors = obj(r.json.errors);
    const detail = str(obj(r.json.error).message) || str(r.json.error) || (Object.keys(errors).length ? JSON.stringify(errors).slice(0, 300) : "");
    if (r.status === 0) return `Couldn't reach the channel manager (${detail || "network error"}).`;
    if (r.status === 401 || r.status === 403) return "The channel manager refused our key. Check the API key in the server settings.";
    if (r.status === 429) return "The channel manager asked us to slow down.";
    return `The channel manager answered ${r.status}${detail ? `: ${detail}` : ""}.`;
  };
  const retryable = (status: number) => status === 0 || status === 429 || status >= 500;

  function pushError(r: { status: number; json: Json; retryAfter?: number }): PushResult {
    return { ok: false, error: failText(r), retryable: retryable(r.status), retryAfterSeconds: r.retryAfter };
  }

  return {
    id: "channex",

    isConfigured: () => Boolean(apiKey()),

    async testConnection(conn) {
      const r = await call("GET", `/properties/${encodeURIComponent(conn.externalPropertyId)}`);
      if (!r.ok) return { ok: false, error: failText(r) };
      return { ok: true, name: str(obj(obj(r.json.data).attributes).title) || null };
    },

    async listMappingTargets(conn) {
      const q = `filter[property_id]=${encodeURIComponent(conn.externalPropertyId)}&pagination[limit]=200`;
      const [rooms, plans] = await Promise.all([call("GET", `/room_types?${q}`), call("GET", `/rate_plans?${q}`)]);
      if (!rooms.ok) return { ok: false, error: failText(rooms) };
      if (!plans.ok) return { ok: false, error: failText(plans) };
      const targets: MappingTargets = {
        roomTypes: arr(rooms.json.data).map((d) => ({ id: str(obj(d).id), title: str(obj(obj(d).attributes).title) || "Room" })),
        ratePlans: arr(plans.json.data).map((d) => {
          const o = obj(d);
          const a = obj(o.attributes);
          const rel = obj(obj(obj(o.relationships).room_type).data);
          return { id: str(o.id), title: str(a.title) || "Rate", roomTypeId: str(a.room_type_id) || str(rel.id) };
        }),
      };
      return { ok: true, targets };
    },

    async pushAri(conn: ChannelConnectionRef, updates: AriUpdate[]): Promise<PushResult> {
      const availability = updates.flatMap((u) =>
        u.kind === "availability"
          ? [{ property_id: conn.externalPropertyId, room_type_id: u.externalRoomTypeId, date_from: u.dateFrom, date_to: u.dateTo, availability: Math.max(0, Math.floor(u.availability)) }]
          : [],
      );
      const restrictions = updates.flatMap((u) => {
        if (u.kind !== "rate") return [];
        const base: Json = {
          property_id: conn.externalPropertyId,
          rate_plan_id: u.externalRatePlanId,
          date_from: u.dateFrom,
          date_to: u.dateTo,
          // Channex needs a rate above zero; a plan with no price is closed instead.
          stop_sell: u.stopSell || !(u.rate > 0),
          closed_to_arrival: u.closedToArrival,
          closed_to_departure: u.closedToDeparture,
          min_stay_arrival: u.minStay && u.minStay > 0 ? u.minStay : 1,
          max_stay: u.maxStay && u.maxStay > 0 ? u.maxStay : 0,
        };
        if (u.rate > 0) base.rate = channexMoney(u.rate);
        return [base];
      });
      const taskIds: string[] = [];
      for (const [path, values] of [["/availability", availability], ["/restrictions", restrictions]] as const) {
        if (values.length === 0) continue;
        const r = await call("POST", path, { values });
        if (!r.ok) return pushError(r);
        for (const t of arr(r.json.data)) {
          const id = str(obj(t).id);
          if (id) taskIds.push(id);
        }
      }
      return { ok: true, taskIds };
    },

    async fetchPending(conn) {
      // VERIFY: paging parameter names on the feed.
      const r = await call("GET", `/booking_revisions/feed?filter[property_id]=${encodeURIComponent(conn.externalPropertyId)}&pagination[limit]=50`);
      if (!r.ok) return { ok: false, error: failText(r) };
      const bookings: InboundBooking[] = [];
      for (const d of arr(r.json.data)) {
        const o = obj(d);
        const b = parseChannexRevision(str(o.id), obj(o.attributes));
        if (b) bookings.push(b);
      }
      return { ok: true, bookings };
    },

    async acknowledge(_conn, revisionId) {
      const r = await call("POST", `/booking_revisions/${encodeURIComponent(revisionId)}/ack`);
      return r.ok ? { ok: true } : { ok: false, error: failText(r) };
    },

    async fetchOne(_conn, revisionId) {
      const r = await call("GET", `/booking_revisions/${encodeURIComponent(revisionId)}`);
      if (!r.ok) return { ok: false, error: failText(r) };
      const d = obj(r.json.data);
      const b = parseChannexRevision(str(d.id) || revisionId, obj(d.attributes));
      return b ? { ok: true, booking: b } : { ok: false, error: "That message wasn't a booking we understand." };
    },

    verifyWebhook(headers, rawBody, nowMs = Date.now()) {
      const key = secret();
      if (!key) return { ok: false, error: "The webhook secret isn't set on the server." };
      const ts = headers.get("x-hmac-timestamp") ?? "";
      const sigHeader = headers.get("x-hmac-signature-256") ?? "";
      if (!ts || !sigHeader) return { ok: false, error: "Missing signature." };
      const tsNum = Number(ts);
      // VERIFY: Channex sends the timestamp in seconds; accept milliseconds too.
      const tsMs = tsNum > 1e12 ? tsNum : tsNum * 1000;
      if (!Number.isFinite(tsMs) || Math.abs(nowMs - tsMs) > 300_000) return { ok: false, error: "The signature is too old." };
      const expected = createHmac("sha256", key).update(`${ts}.${rawBody}`).digest("hex");
      // During key rotation the header can carry two signatures.
      const candidates = sigHeader.split(/[,\s]+/).filter(Boolean);
      const e = Buffer.from(expected);
      const ok = candidates.some((c) => {
        const b = Buffer.from(c.toLowerCase());
        return b.length === e.length && timingSafeEqual(b, e);
      });
      return ok ? { ok: true } : { ok: false, error: "Signature mismatch." };
    },

    parseWebhook(rawBody): WebhookEvent | null {
      let j: Json;
      try {
        j = JSON.parse(rawBody) as Json;
      } catch {
        return null;
      }
      const payload = obj(j.payload);
      // VERIFY: the booking event uses `revision_id`; the unmapped events use `booking_revision_id`.
      const revisionId = str(payload.revision_id) || str(payload.booking_revision_id) || null;
      return { event: str(j.event), externalPropertyId: str(j.property_id) || str(payload.property_id) || null, revisionId };
    },
  };
}

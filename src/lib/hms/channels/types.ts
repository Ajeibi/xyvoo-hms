/*
 * The provider-neutral channel manager contract. Nothing here names a provider. Every provider
 * (Channex today; SiteMinder or HotelRunner later) is one adapter in ./adapters that implements
 * `ChannelProvider`. Safe for the browser and the server.
 */

export type ChannelProviderId = "channex";

/** How we reach one hotel at the provider. The API key itself is never stored: it comes from env. */
export type ChannelConnectionRef = {
  tenantId: string;
  /** The hotel's id at the provider (Channex calls it the property id). */
  externalPropertyId: string;
};

/** Rooms left to sell for a room type over a range of nights. */
export type AvailabilityUpdate = {
  kind: "availability";
  externalRoomTypeId: string;
  dateFrom: string;
  dateTo: string;
  availability: number;
};

/** Price and restrictions for a rate plan over a range of nights. */
export type RateUpdate = {
  kind: "rate";
  externalRatePlanId: string;
  dateFrom: string;
  dateTo: string;
  /** Price per night in the hotel's currency, two decimals. */
  rate: number;
  stopSell: boolean;
  closedToArrival: boolean;
  closedToDeparture: boolean;
  minStay: number | null;
  maxStay: number | null;
};

export type AriUpdate = AvailabilityUpdate | RateUpdate;

export type PushResult =
  | { ok: true; taskIds: string[] }
  /** `retryable` is true for rate limits and server errors; a rejected payload is not retryable. */
  | { ok: false; error: string; retryable: boolean; retryAfterSeconds?: number };

export type MappingTargets = {
  roomTypes: { id: string; title: string }[];
  ratePlans: { id: string; title: string; roomTypeId: string }[];
};

export type InboundStatus = "new" | "modified" | "cancelled";

export type InboundRoom = {
  externalRoomTypeId: string;
  externalRatePlanId: string | null;
  arrival: string;
  departure: string;
  adults: number;
  children: number;
  /** What the channel says this room costs for the whole stay. */
  amount: number | null;
  /** Price per night as the channel sold it. */
  days: Record<string, number>;
  /** The channel's own reference for this room, when it has one. */
  channelRoomRef: string | null;
};

/** A booking, change or cancellation from a channel, in our words. One per provider "revision". */
export type InboundBooking = {
  /** Unique per message from the provider. Receiving the same one twice is harmless. */
  revisionId: string;
  /** The booking this message belongs to, across new, modified and cancelled messages. */
  bookingRef: string;
  /** The OTA's own confirmation number, shown to staff and guests. */
  channelReservationCode: string | null;
  /** "Booking.com", "Expedia"… */
  channelName: string;
  status: InboundStatus;
  externalPropertyId: string;
  arrival: string;
  departure: string;
  currency: string | null;
  amount: number | null;
  commission: number | null;
  /** Who takes the guest's money: the channel (virtual card, prepaid) or the hotel at the desk. */
  paymentCollect: "channel" | "property" | null;
  guest: { firstName: string; lastName: string; email: string; phone: string; country: string | null };
  notes: string | null;
  rooms: InboundRoom[];
};

export type WebhookEvent = { externalPropertyId: string | null; revisionId: string | null; event: string };

export interface ChannelProvider {
  readonly id: ChannelProviderId;
  /** True when the keys this provider needs are in the environment. */
  isConfigured(): boolean;
  testConnection(conn: ChannelConnectionRef): Promise<{ ok: true; name: string | null } | { ok: false; error: string }>;
  /** The rooms and rates that exist at the provider, so staff can match them to ours. */
  listMappingTargets(conn: ChannelConnectionRef): Promise<{ ok: true; targets: MappingTargets } | { ok: false; error: string }>;
  /** One call to the provider. The caller does the queueing, limiting and retrying. */
  pushAri(conn: ChannelConnectionRef, updates: AriUpdate[]): Promise<PushResult>;
  /** Messages not yet acknowledged. */
  fetchPending(conn: ChannelConnectionRef): Promise<{ ok: true; bookings: InboundBooking[] } | { ok: false; error: string }>;
  /** Tells the provider we have stored this message safely, so it stops sending it. */
  acknowledge(conn: ChannelConnectionRef, revisionId: string): Promise<{ ok: true } | { ok: false; error: string }>;
  /** Checks the signature on a webhook. `rawBody` is the exact text received. */
  verifyWebhook(headers: Headers, rawBody: string, nowMs?: number): { ok: true } | { ok: false; error: string };
  parseWebhook(rawBody: string): WebhookEvent | null;
  /** Fetches one message by id (a webhook only says "there is something new"). */
  fetchOne(conn: ChannelConnectionRef, revisionId: string): Promise<{ ok: true; booking: InboundBooking } | { ok: false; error: string }>;
}

/** Longest stretch of nights sent to a channel. Channels sell up to about this far ahead. */
export const CHANNEL_HORIZON_DAYS = 500;
/** Most calls we make to the provider in a minute. Channex asks for 20. */
export const CHANNEL_CALLS_PER_MINUTE = 20;

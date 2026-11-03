/* Browser-safe parts of parcels: statuses, wording and how long one has waited. */

export type ParcelStatus = "received" | "collected" | "returned";

export type GuestParcel = {
  id: string;
  reservationId: string | null;
  recipientName: string;
  roomCode: string | null;
  description: string;
  carrier: string | null;
  trackingRef: string | null;
  shelf: string | null;
  status: ParcelStatus;
  receivedAt: string;
  notifiedAt: string | null;
  notifiedChannel: string | null;
  collectedByName: string | null;
  collectedAt: string | null;
};

/** A parcel still waiting after this many days is flagged, so it is not forgotten on the shelf. */
export const PARCEL_OVERDUE_DAYS = 7;

export function parcelWaitingDays(receivedAt: string, now: Date = new Date()) {
  return Math.max(0, Math.floor((now.getTime() - new Date(receivedAt).getTime()) / 86400000));
}

export function isParcelOverdue(p: Pick<GuestParcel, "status" | "receivedAt">, now: Date = new Date()) {
  return p.status === "received" && parcelWaitingDays(p.receivedAt, now) >= PARCEL_OVERDUE_DAYS;
}

/** The message that tells a guest a parcel has come. `{name}` and `{hotel}` are filled in per guest. */
export function parcelNoticeBody(p: Pick<GuestParcel, "description" | "carrier">) {
  const from = p.carrier ? ` from ${p.carrier}` : "";
  return `Hello {name}, a parcel${from} (${p.description}) has arrived for you at {hotel}. You can collect it from the front desk.`;
}

export const PARCEL_STATUS_LABEL: Record<ParcelStatus, string> = {
  received: "Waiting",
  collected: "Collected",
  returned: "Returned",
};

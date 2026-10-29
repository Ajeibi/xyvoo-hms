/**
 * Tickets taken while the till is offline. They wait in this browser's
 * storage and are sent, oldest first, when the connection comes back. Each
 * ticket carries its own reference, so sending it twice never makes two
 * orders. Payments are never queued: money is only taken online.
 */

/** Minimal storage (window.localStorage, or a stand-in in tests). */
export type QueueStorage = Pick<Storage, "getItem" | "setItem">;

export type QueuedTicket = {
  /** The ticket's own reference, sent as clientRef. */
  ref: string;
  /** When the guest ordered (ISO), for happy-hour prices. */
  orderedAt: string;
  /** What the till would have sent (everything but the slug). */
  payload: Record<string, unknown>;
  /** e.g. "Table T3 · 3 items". */
  label: string;
  attempts: number;
  /** Set when the server refused the ticket (e.g. an item sold out): staff must look. */
  problem: string | null;
};

/** Tickets older than this are refused by the server (prices and stock have moved on). */
export const FB_OFFLINE_MAX_AGE_HOURS = 12;

export const queueKey = (slug: string) => `xyvoo-fb-offline:${slug}`;

export function readQueue(storage: QueueStorage | null, slug: string): QueuedTicket[] {
  if (!storage) return [];
  try {
    const raw = storage.getItem(queueKey(slug));
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((t) => t && typeof t.ref === "string") : [];
  } catch {
    return [];
  }
}

/** Saves the queue. Returns false when storage is full or blocked. */
export function writeQueue(storage: QueueStorage | null, slug: string, tickets: QueuedTicket[]) {
  if (!storage) return false;
  try {
    storage.setItem(queueKey(slug), JSON.stringify(tickets));
    return true;
  } catch {
    return false;
  }
}

export function enqueueTicket(tickets: QueuedTicket[], ticket: Omit<QueuedTicket, "attempts" | "problem">) {
  if (tickets.some((t) => t.ref === ticket.ref)) return tickets;
  return [...tickets, { ...ticket, attempts: 0, problem: null }];
}

export function removeTicket(tickets: QueuedTicket[], ref: string) {
  return tickets.filter((t) => t.ref !== ref);
}

export function markTried(tickets: QueuedTicket[], ref: string, problem: string | null) {
  return tickets.map((t) => (t.ref === ref ? { ...t, attempts: t.attempts + 1, problem } : t));
}

/** Clears a problem so the ticket is sent again on the next try. */
export function retryTicket(tickets: QueuedTicket[], ref: string) {
  return tickets.map((t) => (t.ref === ref ? { ...t, problem: null } : t));
}

/** The tickets to send now: those without a problem, oldest first. */
export function ticketsToSend(tickets: QueuedTicket[]) {
  return tickets.filter((t) => !t.problem).sort((a, b) => a.orderedAt.localeCompare(b.orderedAt));
}

/**
 * What to do after a send. No answer (network down) or a server hiccup:
 * keep it and try again later. Any other refusal (sold out, a bad choice,
 * no permission): stop and show staff the reason.
 */
export function sendOutcome(result: { networkError: boolean; status?: number }): "sent" | "retry" | "problem" {
  if (result.networkError) return "retry";
  const status = result.status ?? 0;
  if (status >= 200 && status < 300) return "sent";
  if (status === 408 || status === 429 || status >= 500) return "retry";
  return "problem";
}

/**
 * The time a ticket was really ordered, as the server will accept it: not in
 * the future (a little clock drift allowed) and not older than the limit.
 * Returns null when it can't be trusted, and the server prices it as now.
 */
export function acceptedOrderedAt(orderedAt: string | null | undefined, now = new Date()) {
  if (!orderedAt) return null;
  const at = new Date(orderedAt);
  if (Number.isNaN(at.getTime())) return null;
  const ageMs = now.getTime() - at.getTime();
  if (ageMs < -2 * 60_000) return null;
  if (ageMs > FB_OFFLINE_MAX_AGE_HOURS * 3_600_000) return null;
  return ageMs < 0 ? now : at;
}

/** True when a ticket is too old for the server to take. */
export function ticketTooOld(orderedAt: string, now = new Date()) {
  return now.getTime() - new Date(orderedAt).getTime() > FB_OFFLINE_MAX_AGE_HOURS * 3_600_000;
}

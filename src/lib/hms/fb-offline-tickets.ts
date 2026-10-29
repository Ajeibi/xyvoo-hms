"use client";

import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import {
  enqueueTicket,
  markTried,
  type QueuedTicket,
  queueKey,
  readQueue,
  removeTicket,
  retryTicket,
  sendOutcome,
  ticketsToSend,
  writeQueue,
} from "@/lib/hms/fb-offline-queue";

const RETRY_MS = 30_000;

function browserStorage() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

// Changes made in this tab (storage events only fire for other tabs).
const listeners = new Set<() => void>();
const notify = () => {
  for (const l of listeners) l();
};

function subscribeQueue(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

function subscribeOnline(listener: () => void) {
  window.addEventListener("online", listener);
  window.addEventListener("offline", listener);
  return () => {
    window.removeEventListener("online", listener);
    window.removeEventListener("offline", listener);
  };
}

/** Whether the browser thinks it has a connection (true while rendering on the server). */
export function useOnline() {
  return useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true);
}

export type SentTicket = { ticket: QueuedTicket; order: { id: string; order_number?: string } | null; duplicate: boolean };

/**
 * The tickets waiting on this till, and sending them. Sends oldest first when
 * the connection comes back, every 30 seconds while any wait, and on demand.
 * Stops at the first network failure; a refused ticket is kept with the
 * reason for staff to retry or discard.
 */
export function useOfflineTickets(
  slug: string,
  handlers: { onSent?: (sent: SentTicket) => void; onProblem?: (ticket: QueuedTicket, problem: string) => void } = {},
) {
  const key = queueKey(slug);
  const raw = useSyncExternalStore(
    subscribeQueue,
    () => {
      try {
        return window.localStorage.getItem(key) ?? "[]";
      } catch {
        return "[]";
      }
    },
    () => "[]",
  );
  const tickets = useMemo(() => {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? (parsed as QueuedTicket[]) : [];
    } catch {
      return [];
    }
  }, [raw]);
  const online = useOnline();
  const sending = useRef(false);
  const handlersRef = useRef(handlers);
  useEffect(() => {
    handlersRef.current = handlers;
  });

  const update = useCallback(
    (change: (current: QueuedTicket[]) => QueuedTicket[]) => {
      const storage = browserStorage();
      const ok = writeQueue(storage, slug, change(readQueue(storage, slug)));
      notify();
      return ok;
    },
    [slug],
  );

  /** Keeps a ticket on this till. Returns false when the browser can't store it. */
  const enqueue = useCallback(
    (ticket: Omit<QueuedTicket, "attempts" | "problem">) => update((q) => enqueueTicket(q, ticket)),
    [update],
  );

  const flush = useCallback(async () => {
    if (sending.current) return;
    sending.current = true;
    try {
      for (const ticket of ticketsToSend(readQueue(browserStorage(), slug))) {
        let status: number | undefined;
        let networkError = false;
        let json: { error?: string; order?: { id: string; order_number?: string }; duplicate?: boolean } = {};
        try {
          const res = await fetch("/api/hotel/fb/orders", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ slug, ...ticket.payload, clientRef: ticket.ref, orderedAt: ticket.orderedAt }),
          });
          status = res.status;
          json = await res.json().catch(() => ({}));
        } catch {
          networkError = true;
        }
        const outcome = sendOutcome({ networkError, status });
        if (outcome === "retry") {
          update((q) => markTried(q, ticket.ref, null));
          break;
        }
        if (outcome === "problem") {
          const problem = json.error ?? "The server refused this ticket.";
          update((q) => markTried(q, ticket.ref, problem));
          handlersRef.current.onProblem?.(ticket, problem);
          continue;
        }
        update((q) => removeTicket(q, ticket.ref));
        handlersRef.current.onSent?.({ ticket, order: json.order ?? null, duplicate: Boolean(json.duplicate) });
      }
    } finally {
      sending.current = false;
    }
  }, [slug, update]);

  // Send when the connection comes back, and keep trying while tickets wait.
  const waiting = ticketsToSend(tickets).length;
  useEffect(() => {
    if (!online || waiting === 0) return;
    const first = window.setTimeout(() => void flush(), 500);
    const timer = window.setInterval(() => void flush(), RETRY_MS);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
    };
  }, [online, waiting, flush]);

  return {
    tickets,
    online,
    enqueue,
    flush,
    retry: (ref: string) => update((q) => retryTicket(q, ref)),
    discard: (ref: string) => update((q) => removeTicket(q, ref)),
  };
}

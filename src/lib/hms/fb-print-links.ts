"use client";

import { useCallback, useSyncExternalStore } from "react";

export function receiptPrintUrl(slug: string, orderId: string, auto = true) {
  return `/hms-print/${encodeURIComponent(slug)}/receipt/${orderId}${auto ? "?auto=1" : ""}`;
}

export function kitchenTicketPrintUrl(slug: string, orderId: string, auto = true) {
  return `/hms-print/${encodeURIComponent(slug)}/kitchen/${orderId}${auto ? "?auto=1" : ""}`;
}

/** Opens a print page in a new tab now (must run inside a click, or browsers block it). */
export function openPrint(url: string) {
  window.open(url, "_blank", "noopener");
}

/**
 * Opens an empty tab during the click, so it isn't blocked as a pop-up, and
 * returns a function to send it to the print page once the server has answered
 * (or close it if the action failed).
 */
export function reservePrintWindow() {
  const win = window.open("about:blank", "_blank");
  return {
    go(url: string) {
      if (win && !win.closed) win.location.href = url;
    },
    cancel() {
      if (win && !win.closed) win.close();
    },
  };
}

/**
 * A per-device on/off switch remembered in this browser (printers belong to a
 * device, not to the hotel). Falls back to off when storage isn't available.
 */
export function useDevicePrintSetting(key: string) {
  const storageKey = `xyvoo-fb-print:${key}`;
  const on = useSyncExternalStore(
    subscribeToSettings,
    () => readSetting(storageKey),
    () => false,
  );
  const set = useCallback(
    (value: boolean) => {
      memory.set(storageKey, value);
      try {
        window.localStorage.setItem(storageKey, value ? "1" : "0");
      } catch {
        /* storage blocked: works for this visit only */
      }
      for (const listener of listeners) listener();
    },
    [storageKey],
  );
  return [on, set] as const;
}

// Settings changed in this tab (and the fallback when storage is blocked).
const memory = new Map<string, boolean>();
const listeners = new Set<() => void>();

function subscribeToSettings(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

function readSetting(storageKey: string) {
  try {
    const stored = window.localStorage.getItem(storageKey);
    if (stored !== null) return stored === "1";
  } catch {
    /* storage blocked */
  }
  return memory.get(storageKey) ?? false;
}

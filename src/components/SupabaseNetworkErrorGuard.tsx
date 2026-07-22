"use client";

import { useEffect } from "react";

/** Names/messages Supabase's auth client uses for a plain "couldn't reach the server" failure. */
function isBenignNetworkError(reason: unknown): boolean {
  if (!(reason instanceof Error)) return false;
  if (reason.name === "AuthRetryableFetchError" || reason.name === "AuthUnknownError") {
    return true;
  }
  const message = reason.message?.toLowerCase() ?? "";
  return (
    message.includes("failed to fetch") ||
    message.includes("networkerror") ||
    message.includes("load failed")
  );
}

/**
 * Supabase's GoTrueClient recovers/validates any stored session the moment its browser
 * client is constructed — before any of our own code runs, and without exposing that
 * promise for us to .catch(). Offline (or Supabase unreachable), that internal retry
 * eventually rejects and reaches the window as an unhandled rejection, which Next's dev
 * overlay then reports as a crash even though the app already handles the real sign-in
 * flow's own network errors gracefully. This suppresses only that specific, benign case.
 */
export function SupabaseNetworkErrorGuard() {
  useEffect(() => {
    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      if (isBenignNetworkError(event.reason)) {
        event.preventDefault();
      }
    };
    window.addEventListener("unhandledrejection", onUnhandledRejection);
    return () => window.removeEventListener("unhandledrejection", onUnhandledRejection);
  }, []);

  return null;
}

"use client";

import { useState } from "react";
import { toastError, toastSuccess } from "@/lib/app-toast";

export type RoomsMutationOptions = {
  successMessage?: string;
  errorTitle?: string;
  /** When false, skip error toasts (e.g. manager PIN retry). Default true. */
  toastOnError?: boolean;
};

export function useRoomsMutation() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [requiresPin, setRequiresPin] = useState(false);
  const [managerPin, setManagerPin] = useState("");

  async function run(
    url: string,
    method: string,
    body: Record<string, unknown>,
    options?: RoomsMutationOptions,
  ): Promise<{ ok: boolean; data: Record<string, unknown> }> {
    setLoading(true);
    setError(null);
    try {
      const payload = managerPin ? { ...body, managerPin } : body;
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json()) as Record<string, unknown>;
      if (!res.ok) {
        if (data.requiresPin) {
          setRequiresPin(true);
          setError(String(data.error ?? "Manager PIN required."));
        } else {
          const msg = String(data.error ?? "Request failed");
          setError(msg);
          if (options?.toastOnError !== false) {
            toastError(options?.errorTitle ?? "Request failed", msg);
          }
        }
        return { ok: false, data };
      }
      setRequiresPin(false);
      setManagerPin("");
      if (options?.successMessage) {
        toastSuccess(options.successMessage);
      }
      return { ok: true, data };
    } catch {
      const msg = "Request failed.";
      setError(msg);
      if (options?.toastOnError !== false) {
        toastError(options?.errorTitle ?? "Request failed", msg);
      }
      return { ok: false, data: {} };
    } finally {
      setLoading(false);
    }
  }

  return {
    loading,
    error,
    requiresPin,
    managerPin,
    setManagerPin,
    setError,
    run,
  };
}

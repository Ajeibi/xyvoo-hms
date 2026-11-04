"use client";

import { useCallback, useEffect, useState } from "react";
import { toastError, toastSuccess } from "@/lib/app-toast";
import type { RateBook } from "@/lib/hms/rates/types";

export type Company = { id: string; name: string };

/** The hotel's rate book for a revenue screen, with a helper to change it and refresh. */
export function useRateBook(slug: string) {
  const [book, setBook] = useState<RateBook | null>(null);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [failed, setFailed] = useState(false);

  const apply = (data: { book?: RateBook; companies?: Company[]; canManage?: boolean }) => {
    if (data.book) setBook(data.book);
    if (data.companies) setCompanies(data.companies);
    setCanManage(Boolean(data.canManage));
  };

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/hotel/rates?slug=${encodeURIComponent(slug)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data) => {
        if (!cancelled) apply(data);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  /** Send a change. Returns true when it was saved. */
  const change = useCallback(
    async (body: Record<string, unknown>, done: string): Promise<boolean> => {
      const res = await fetch("/api/hotel/rates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, ...body }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toastError("Not saved", data.error ?? "Please try again.");
        return false;
      }
      apply(data);
      toastSuccess("Saved", done);
      return true;
    },
    [slug],
  );

  return { book, companies, canManage, failed, change };
}

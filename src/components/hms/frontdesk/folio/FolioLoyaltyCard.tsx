"use client";

import { useCallback, useEffect, useState } from "react";
import { Gift } from "lucide-react";
import { toastError, toastSuccess } from "@/lib/app-toast";
import { HmsCard, hmsButton, hmsInput } from "@/components/hms/hms-ui";

type BillLoyalty = {
  enabled: boolean;
  guestName: string;
  balance: number;
  pointValue: number;
  maxPoints: number;
  owed: number;
};

/** Pay part of this bill with the guest's loyalty points. Shows nothing when loyalty is off or the guest has no points. */
export function FolioLoyaltyCard({
  slug,
  reservationId,
  currency,
  version,
  onPaid,
}: {
  slug: string;
  reservationId: string;
  currency: string;
  /** Changes whenever the bill reloads, so the figures here stay current. */
  version: unknown;
  onPaid: () => void;
}) {
  const [info, setInfo] = useState<BillLoyalty | null>(null);
  const [points, setPoints] = useState("");
  const [busy, setBusy] = useState(false);

  const url = `/api/hotel/folio/loyalty?slug=${encodeURIComponent(slug)}&reservationId=${encodeURIComponent(reservationId)}`;
  const [reload, setReload] = useState(0);
  const load = useCallback(() => setReload((n) => n + 1), []);

  // Re-read whenever the bill changes (or after points are used).
  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        const res = await fetch(url);
        if (live && res.ok) setInfo((await res.json()) as BillLoyalty);
      } catch {
        if (live) setInfo(null);
      }
    })();
    return () => {
      live = false;
    };
  }, [url, version, reload]);

  if (!info || !info.enabled || info.balance <= 0) return null;

  const n = Math.trunc(Number(points));
  const worth = Number.isFinite(n) && n > 0 ? n * info.pointValue : 0;
  const money = (v: number) => `${currency} ${v.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!(n > 0)) return toastError("Enter how many points to use");
    setBusy(true);
    try {
      const res = await fetch("/api/hotel/folio/loyalty", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, reservationId, points: n }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return toastError("Could not use the points", data.error ?? "Try again.");
      toastSuccess("Points used", `${data.points} points paid ${money(data.amount)}.`);
      setPoints("");
      onPaid();
      load();
    } finally {
      setBusy(false);
    }
  };

  return (
    <HmsCard id="folio-loyalty" icon={Gift} meaning="money" title="Pay with points">
      <form onSubmit={submit} className="space-y-3">
        <p className="text-sm text-slate-600">
          {info.guestName} has <strong>{info.balance.toLocaleString()}</strong> points. Each is worth {money(info.pointValue)}.
          {info.maxPoints > 0 ? ` Up to ${info.maxPoints.toLocaleString()} can go on this bill.` : " There is nothing left to pay on this bill."}
        </p>
        {info.maxPoints > 0 ? (
          <>
            <label htmlFor="loyalty-points" className="block text-sm font-medium text-slate-700">
              Points to use
            </label>
            <div className="flex gap-2">
              <input
                id="loyalty-points"
                type="number"
                min={1}
                max={info.maxPoints}
                step={1}
                value={points}
                onChange={(e) => setPoints(e.target.value)}
                className={hmsInput}
              />
              <button type="button" className={hmsButton.secondary} onClick={() => setPoints(String(info.maxPoints))}>
                Use the most
              </button>
            </div>
            {worth > 0 ? <p className="text-sm text-slate-600">That pays {money(worth)}.</p> : null}
            <button type="submit" disabled={busy} className={hmsButton.primary}>
              {busy ? "Using points…" : "Pay with points"}
            </button>
          </>
        ) : null}
      </form>
    </HmsCard>
  );
}

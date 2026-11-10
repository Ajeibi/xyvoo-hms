"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Repeat } from "lucide-react";
import { HmsAlert, HmsCard, HmsPill, hmsButton } from "@/components/hms/hms-ui";
import { callHr } from "@/components/hms/hr/hr-ui";
import { SWAP_KIND_LABEL, SWAP_STATUS_LABEL, formatDay, isoToLocalTime, type Shift, type SwapRequest } from "@/lib/hms/hr/hr-shared";

const when = (s: Shift | null) => (s ? `${formatDay(s.shiftDate)} ${isoToLocalTime(s.startsAt)}–${isoToLocalTime(s.endsAt)}` : "a shift");

export function SwapRequestsCard({ slug, swaps }: { slug: string; swaps: SwapRequest[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (!swaps.length) return null;

  async function decide(id: string, approve: boolean) {
    setBusy(true);
    setError("");
    const { error: err } = await callHr("/api/hotel/hr/swaps", "POST", { slug, id, approve });
    setBusy(false);
    if (err) return setError(err);
    router.refresh();
  }

  return (
    <HmsCard title="Swaps and open shifts" description="Staff ask on the clock screen; you approve once the colleague has agreed." icon={Repeat} meaning="team">
      <ul className="divide-y divide-slate-100 text-sm">
        {swaps.map((s) => (
          <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
            <span className="text-slate-800">
              <HmsPill tone="blue">{SWAP_KIND_LABEL[s.kind]}</HmsPill>{" "}
              {s.kind === "pick_up" ? (
                <>
                  <strong>{s.toName}</strong> wants the open shift {when(s.shift)}
                </>
              ) : s.kind === "swap" ? (
                <>
                  <strong>{s.fromName}</strong> ({when(s.shift)}) swaps with <strong>{s.toName}</strong> ({when(s.otherShift)})
                </>
              ) : (
                <>
                  <strong>{s.fromName}</strong> gives {when(s.shift)} to <strong>{s.toName ?? "anyone"}</strong>
                </>
              )}
              {s.note ? <span className="text-slate-500"> · “{s.note}”</span> : null} <span className="text-slate-500">· {SWAP_STATUS_LABEL[s.status]}</span>
            </span>
            <span className="flex gap-2">
              {s.status === "accepted" ? (
                <button type="button" className={hmsButton.small} disabled={busy} onClick={() => void decide(s.id, true)}>
                  Approve
                </button>
              ) : null}
              <button type="button" className={hmsButton.danger} disabled={busy} onClick={() => void decide(s.id, false)}>
                Decline
              </button>
            </span>
          </li>
        ))}
      </ul>
      <HmsAlert message={error} />
    </HmsCard>
  );
}

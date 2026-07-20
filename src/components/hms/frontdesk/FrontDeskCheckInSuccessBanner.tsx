"use client";

import { useSearchParams } from "next/navigation";

export function FrontDeskCheckInSuccessBanner() {
  const searchParams = useSearchParams();
  const checkedIn = searchParams.get("checkedIn");
  const reserved = searchParams.get("reserved");
  const code = checkedIn ?? reserved;

  if (!code) return null;

  return (
    <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm text-emerald-900">
      <p className="font-semibold">
        {checkedIn ? "Guest checked in successfully" : "Reservation created successfully"}
      </p>
      <p className="mt-1 text-emerald-800">
        Confirmation <span className="font-mono font-medium">{code}</span>
        {checkedIn ? " — room board updated." : " — the guest will check in on arrival."}
      </p>
    </div>
  );
}

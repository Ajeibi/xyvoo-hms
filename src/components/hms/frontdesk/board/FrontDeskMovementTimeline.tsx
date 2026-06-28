"use client";

import Link from "next/link";
import type { FrontDeskMovementItem } from "@/lib/hms/front-desk-board";
import { openCheckoutDialog } from "@/lib/hms/open-checkout-bus";
import { LogIn, LogOut, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

function highlightClass(highlight: FrontDeskMovementItem["highlight"]) {
  if (highlight === "overdue") return "border-red-200 bg-red-50/80";
  if (highlight === "soon") return "border-amber-200 bg-amber-50/60";
  return "border-slate-100 bg-slate-50/60";
}

function MovementList({
  items,
  kind,
  slug,
  emptyMessage,
}: {
  items: FrontDeskMovementItem[];
  kind: "arrival" | "departure";
  slug: string;
  emptyMessage: string;
}) {
  const filtered = items.filter((i) => i.kind === kind);
  if (filtered.length === 0) {
    return <p className="text-sm text-slate-500">{emptyMessage}</p>;
  }
  return (
    <ul className="space-y-3">
      {filtered.map((item) => (
        <li
          key={item.id}
          className={cn("rounded-xl border px-4 py-3 text-sm", highlightClass(item.highlight))}
        >
          <div className="flex flex-wrap items-start justify-between gap-2">
            <p className="font-semibold text-slate-900">
              {item.isVip ? (
                <Star className="mr-1 inline h-3.5 w-3.5 fill-amber-400 text-amber-500" aria-label="VIP" />
              ) : null}
              {item.guestName}
            </p>
            <span className="text-xs font-medium tabular-nums text-slate-600">{item.time}</span>
          </div>
          <p className="mt-1 text-slate-600">
            {item.roomCode ? `Room ${item.roomCode}` : "Room TBD"} · {item.bookingSourceLabel}
          </p>
          <p className="mt-0.5 text-xs text-slate-500">
            {item.paymentLabel} · {item.confirmationCode}
            {item.guestId ? (
              <>
                {" "}
                ·{" "}
                <Link
                  href={`/hms/${slug}/guests/${item.guestId}`}
                  className="font-medium text-blue-600 hover:underline"
                >
                  Profile
                </Link>
              </>
            ) : null}
          </p>
          {kind === "departure" && item.canCheckOut ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="mt-3 h-8 border-orange-200 text-orange-800 hover:bg-orange-50"
              onClick={() =>
                openCheckoutDialog({
                  roomCode: item.roomCode ?? undefined,
                  reservationId: item.id,
                })
              }
            >
              <LogOut className="mr-1.5 h-3.5 w-3.5" />
              Check out
            </Button>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

export function FrontDeskMovementTimeline({
  slug,
  arrivals,
  departures,
}: {
  slug: string;
  arrivals: FrontDeskMovementItem[];
  departures: FrontDeskMovementItem[];
}) {
  return (
    <section className="grid gap-4 lg:grid-cols-2" aria-label="Arrival and departure timeline" id="fd-movement-timeline">
      <div className="overflow-hidden rounded-[24px] border border-slate-200 bg-white p-6 shadow-sm shadow-slate-200/25 sm:p-7">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
            <LogIn className="h-5 w-5" aria-hidden />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">Today</p>
            <h2 className="text-lg font-semibold text-slate-900">Arrivals</h2>
          </div>
        </div>
        <div className="mt-5">
          <MovementList
            items={arrivals}
            kind="arrival"
            slug={slug}
            emptyMessage="No arrivals scheduled for today."
          />
        </div>
      </div>
      <div className="overflow-hidden rounded-[24px] border border-slate-200 bg-white p-6 shadow-sm shadow-slate-200/25 sm:p-7">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-orange-50 text-orange-600">
              <LogOut className="h-5 w-5" aria-hidden />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">Today</p>
              <h2 className="text-lg font-semibold text-slate-900">Departures</h2>
            </div>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="hidden shrink-0 border-orange-200 text-orange-800 hover:bg-orange-50 sm:inline-flex"
            onClick={() => openCheckoutDialog()}
          >
            Check out guest
          </Button>
        </div>
        <div className="mt-5">
          <MovementList
            items={departures}
            kind="departure"
            slug={slug}
            emptyMessage="No departures scheduled for today."
          />
        </div>
      </div>
    </section>
  );
}

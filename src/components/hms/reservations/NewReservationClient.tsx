"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { BedDouble, CalendarDays, CheckCircle2, Search, UserRound } from "lucide-react";
import { HmsCard, HmsPill, HmsWarning, hmsButton, hmsInput } from "@/components/hms/hms-ui";
import { toastError } from "@/lib/app-toast";
import { formatPricingAmount } from "@/lib/hms/room-pricing";
import { addDays, formatDayLong, formatDayShort, nightsBetweenDays } from "@/lib/hms/reservation-availability-shared";
import type { BookingSource } from "@/lib/hms/reservation-create-shared";
import { useBookingOptions } from "@/lib/hms/useBookingOptions";

type TypeRow = {
  id: string;
  name: string;
  maxOccupancy: number;
  fits: boolean;
  fitsMessage: string | null;
  roomsLeft: number;
  overbook: number;
  roomsLeftWithAllowance: number;
  stock: number;
  nightlyRate: number;
  roomTotal: number;
  taxTotal: number;
  grandTotal: number;
  depositRequired: number;
  depositDueDate: string | null;
  cancellationLines: string[];
  freeRooms: { id: string; roomCode: string; floor: number }[];
  ratePlan?: { code: string; name: string; boardBasis: string; refundable: boolean };
  rateIssues?: string[];
};
type PlanOption = { id: string; code: string; name: string; boardBasis: string; refundable: boolean; arCustomerId: string | null; isDefault: boolean };
type Availability = { currency: string; plans?: PlanOption[]; nights: number; types: TypeRow[]; allotments: { id: string; name: string; roomTypeCode: string; rooms: number }[] };
type GuestHit = { id: string; name: string; phone: string; email: string; isVip: boolean; visitCount: number; tier: string | null };
type Agent = { id: string; name: string };

const focusRing = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2";

function Label({ htmlFor, children }: { htmlFor: string; children: React.ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="mb-1 block text-sm font-medium text-slate-800">
      {children}
    </label>
  );
}

/**
 * The reservations desk's own booking screen: dates and party first, then which room types are
 * free (and what they cost), then who the guest is. ID details are collected at check-in, not here.
 */
export function NewReservationClient({
  slug,
  today,
  initial,
}: {
  slug: string;
  today: string;
  initial?: { arrival?: string; departure?: string; roomTypeCode?: string; roomUnitId?: string };
}) {
  const ids = useId();
  const [arrival, setArrival] = useState(initial?.arrival && initial.arrival >= today ? initial.arrival : today);
  const [departure, setDeparture] = useState(initial?.departure && initial.departure > (initial.arrival ?? today) ? initial.departure : addDays(initial?.arrival && initial.arrival >= today ? initial.arrival : today, 1));
  const [adults, setAdults] = useState(2);
  const [children, setChildren] = useState(0);
  const [avail, setAvail] = useState<Availability | null>(null);
  const [availError, setAvailError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [typeId, setTypeId] = useState<string | null>(initial?.roomTypeCode ?? null);
  const [roomId, setRoomId] = useState<string>(initial?.roomUnitId ?? "");
  const [allotmentId, setAllotmentId] = useState("");
  const [planCode, setPlanCode] = useState("");
  const [restrictionOverride, setRestrictionOverride] = useState(false);

  const [mode, setMode] = useState<"search" | "new">("search");
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<GuestHit[]>([]);
  const [picked, setPicked] = useState<GuestHit | null>(null);
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");

  const [source, setSource] = useState<BookingSource>("phone");
  const sourceOptions = useBookingOptions(slug, "source");
  const [agents, setAgents] = useState<Agent[]>([]);
  const [agentId, setAgentId] = useState("");
  const [notes, setNotes] = useState("");
  const [vip, setVip] = useState(false);
  const [sendEmail, setSendEmail] = useState(true);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [override, setOverride] = useState<{ reason: string; pin: string } | null>(null);
  const [done, setDone] = useState<{ id: string; code: string; email: { status: string; reason?: string } | null; matched: boolean; total: number } | null>(null);

  const nights = departure > arrival ? nightsBetweenDays(arrival, departure) : 0;

  // Which room types are free for these dates.
  const requestSeq = useRef(0);
  useEffect(() => {
    if (!(departure > arrival)) {
      setAvail(null);
      setAvailError("The departure must be after the arrival.");
      return;
    }
    const seq = ++requestSeq.current;
    setLoading(true);
    const timer = setTimeout(() => {
      fetch(`/api/hotel/reservations/availability?slug=${encodeURIComponent(slug)}&arrival=${arrival}&departure=${departure}&adults=${adults}&children=${children}${planCode ? `&plan=${encodeURIComponent(planCode)}` : ""}`)
        .then(async (r) => ({ ok: r.ok, data: await r.json().catch(() => ({})) }))
        .then(({ ok, data }) => {
          if (seq !== requestSeq.current) return;
          if (!ok) {
            setAvail(null);
            setAvailError(data.error ?? "Could not check availability.");
          } else {
            setAvail(data as Availability);
            setAvailError(null);
          }
        })
        .catch(() => seq === requestSeq.current && setAvailError("Could not check availability."))
        .finally(() => seq === requestSeq.current && setLoading(false));
    }, 250);
    return () => clearTimeout(timer);
  }, [slug, arrival, departure, adults, children, planCode]);

  useEffect(() => {
    fetch(`/api/hotel/travel-agents?slug=${encodeURIComponent(slug)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setAgents((d.agents ?? []).map((a: Agent) => ({ id: a.id, name: a.name }))))
      .catch(() => {});
  }, [slug]);

  // Guests already on file.
  useEffect(() => {
    const q = query.trim();
    if (mode !== "search" || q.length < 2) {
      setHits([]);
      return;
    }
    const timer = setTimeout(() => {
      fetch(`/api/hotel/reservations/guest-search?slug=${encodeURIComponent(slug)}&q=${encodeURIComponent(q)}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => d && setHits(d.guests ?? []))
        .catch(() => {});
    }, 250);
    return () => clearTimeout(timer);
  }, [query, mode, slug]);

  const selected = avail?.types.find((t) => t.id === typeId) ?? null;
  const currency = avail?.currency ?? "NGN";
  const soldOut = selected ? selected.roomsLeft <= 0 : false;
  const overLimit = selected ? selected.roomsLeftWithAllowance <= 0 : false;
  const allotmentOptions = (avail?.allotments ?? []).filter((a) => a.roomTypeCode === typeId);

  const guestReady = mode === "search" ? Boolean(picked) : Boolean(first.trim() && last.trim() && (phone.trim() || email.trim()));
  const canBook = Boolean(selected && selected.fits && guestReady && nights > 0 && !busy);

  const submit = useCallback(
    async (withOverride: { reason: string; pin: string } | null) => {
      if (!selected) return;
      setBusy(true);
      setError(null);
      try {
        const res = await fetch("/api/hotel/reservations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            slug,
            arrivalDay: arrival,
            departureDay: departure,
            roomTypeCode: selected.id,
            roomUnitId: roomId || null,
            adults,
            children,
            guestId: mode === "search" ? picked?.id : null,
            newGuest: mode === "new" ? { firstName: first, lastName: last, phone, email } : null,
            source,
            travelAgentId: source === "travel_agent" && agentId ? agentId : null,
            allotmentId: allotmentId || null,
            notes: notes || null,
            vip,
            sendEmail,
            ratePlan: planCode || null,
            overrideReason: restrictionOverride ? undefined : withOverride?.reason || undefined,
            restrictionOverrideReason: restrictionOverride ? withOverride?.reason || undefined : undefined,
            managerPin: withOverride?.pin || undefined,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          if (data.canOverrideRestriction) setRestrictionOverride(true);
          if (data.canOverride || data.canOverrideRestriction || data.requiresPin) {
            setOverride((o) => o ?? { reason: "", pin: "" });
          }
          setError(data.error ?? "The booking couldn't be made.");
          if (!data.canOverride && !data.canOverrideRestriction && !data.requiresPin) toastError("Not booked", data.error ?? "Try again.");
          return;
        }
        setDone({ id: data.reservationId, code: data.confirmationCode, email: data.email ?? null, matched: Boolean(data.matchedExistingGuest), total: data.grandTotal });
      } finally {
        setBusy(false);
      }
    },
    [selected, slug, arrival, departure, roomId, adults, children, mode, picked, first, last, phone, email, source, agentId, allotmentId, notes, vip, sendEmail, planCode, restrictionOverride],
  );

  if (done) {
    return (
      <HmsCard id="booking-done" icon={CheckCircle2} meaning="rooms" title="Booking made">
        <div className="space-y-3 text-sm text-slate-700" role="status">
          <p className="text-base font-semibold text-slate-900">{done.code}</p>
          <p>
            {formatDayLong(arrival)} to {formatDayLong(departure)}, {nights} night{nights === 1 ? "" : "s"}. Total {formatPricingAmount(done.total, currency)} with taxes.
          </p>
          {done.matched ? <p>This guest was already on file, so the booking is on their existing profile.</p> : null}
          {done.email ? (
            <p>
              {done.email.status === "sent"
                ? "A confirmation email has gone to the guest."
                : done.email.status === "skipped"
                  ? (done.email.reason ?? "No confirmation email was sent.")
                  : "The confirmation email could not be sent. You can send it again from the booking."}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2 pt-1">
            <Link href={`/hms/${slug}/reservations/${done.id}`} className={`${hmsButton.primary} ${focusRing}`}>
              Open the booking
            </Link>
            <Link href={`/hms/${slug}/reservations/calendar`} className={`${hmsButton.secondary} ${focusRing}`}>
              See it on the calendar
            </Link>
            <button type="button" className={`${hmsButton.secondary} ${focusRing}`} onClick={() => window.location.assign(`/hms/${slug}/reservations/new`)}>
              Make another booking
            </button>
          </div>
        </div>
      </HmsCard>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_20rem]">
      <div className="space-y-5">
        <HmsCard id="booking-stay" icon={CalendarDays} meaning="rooms" title="1. The stay" description="Dates and who is coming. The rooms free for those nights show below.">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
            <div>
              <Label htmlFor={`${ids}-arr`}>Arrival</Label>
              <input id={`${ids}-arr`} type="date" min={today} className={hmsInput} value={arrival} onChange={(e) => {
                const v = e.target.value;
                setArrival(v);
                if (v && departure <= v) setDeparture(addDays(v, 1));
              }} />
            </div>
            <div>
              <Label htmlFor={`${ids}-dep`}>Departure</Label>
              <input id={`${ids}-dep`} type="date" min={addDays(arrival, 1)} className={hmsInput} value={departure} onChange={(e) => setDeparture(e.target.value)} />
            </div>
            <div>
              <Label htmlFor={`${ids}-ad`}>Adults</Label>
              <input id={`${ids}-ad`} type="number" min={1} max={20} className={hmsInput} value={adults} onChange={(e) => setAdults(Math.max(1, Number(e.target.value) || 1))} />
            </div>
            <div>
              <Label htmlFor={`${ids}-ch`}>Children</Label>
              <input id={`${ids}-ch`} type="number" min={0} max={20} className={hmsInput} value={children} onChange={(e) => setChildren(Math.max(0, Number(e.target.value) || 0))} />
            </div>
          </div>
          {avail?.plans && avail.plans.length > 1 ? (
            <div className="mt-3 max-w-sm">
              <Label htmlFor={`${ids}-plan`}>Rate plan</Label>
              <select id={`${ids}-plan`} className={hmsInput} value={planCode} onChange={(e) => { setPlanCode(e.target.value); setRestrictionOverride(false); setOverride(null); }}>
                {avail.plans.map((p) => (
                  <option key={p.id} value={p.isDefault ? "" : p.code}>
                    {p.name} · {p.boardBasis}{p.refundable ? "" : " · non-refundable"}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          <p className="mt-2 text-sm text-slate-600">{nights > 0 ? `${nights} night${nights === 1 ? "" : "s"}, ${formatDayShort(arrival)} to ${formatDayShort(departure)}.` : ""}</p>
        </HmsCard>

        <HmsCard id="booking-room" icon={BedDouble} meaning="rooms" title="2. Choose a room type" description="Rooms left is the fewest free on any night of the stay.">
          {availError ? (
            <p role="alert" className="text-sm text-red-700">
              {availError}
            </p>
          ) : !avail ? (
            <p role="status" className="text-sm text-slate-600">
              Checking what is free…
            </p>
          ) : avail.types.length === 0 ? (
            <p className="text-sm text-slate-600">Set up your room types in hotel settings first.</p>
          ) : (
            <ul className={`grid grid-cols-1 gap-3 sm:grid-cols-2 ${loading ? "opacity-60" : ""}`} aria-busy={loading}>
              {avail.types.map((t) => {
                const out = t.roomsLeft <= 0;
                const isSel = t.id === typeId;
                return (
                  <li key={t.id}>
                    <button
                      type="button"
                      aria-pressed={isSel}
                      disabled={!t.fits}
                      onClick={() => {
                        setTypeId(t.id);
                        setRoomId("");
                        setAllotmentId("");
                      }}
                      className={`w-full rounded-xl border p-3 text-left transition-colors ${focusRing} ${isSel ? "border-blue-600 bg-blue-50 ring-1 ring-blue-600" : "border-slate-200 bg-white hover:bg-slate-50"} ${!t.fits ? "opacity-50" : ""}`}
                    >
                      <span className="flex items-start justify-between gap-2">
                        <span className="font-semibold text-slate-900">{t.name}</span>
                        {out ? (
                          <HmsPill tone={t.roomsLeftWithAllowance > 0 ? "amber" : "red"}>{t.roomsLeftWithAllowance > 0 ? "Over the room count" : "Sold out"}</HmsPill>
                        ) : (
                          <HmsPill tone={t.roomsLeft <= 2 ? "amber" : "green"}>
                            {t.roomsLeft} left
                          </HmsPill>
                        )}
                      </span>
                      <span className="mt-1 block text-sm text-slate-700">
                        {formatPricingAmount(t.nightlyRate, currency)} a night · {formatPricingAmount(t.grandTotal, currency)} for the stay with taxes
                      </span>
                      <span className="mt-0.5 block text-xs text-slate-600">
                        Up to {t.maxOccupancy} guests{t.overbook > 0 ? ` · ${t.overbook} extra allowed to sell` : ""}
                      </span>
                      {!t.fits ? <span className="mt-1 block text-xs text-red-700">{t.fitsMessage}</span> : null}
                      {(t.rateIssues ?? []).map((m) => (
                        <span key={m} className="mt-1 block text-xs text-amber-800">{m}</span>
                      ))}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {selected ? (
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor={`${ids}-room`}>A particular room (optional)</Label>
                <select id={`${ids}-room`} className={hmsInput} value={roomId} onChange={(e) => setRoomId(e.target.value)}>
                  <option value="">Choose a room later</option>
                  {selected.freeRooms.map((r) => (
                    <option key={r.id} value={r.id}>
                      Room {r.roomCode} (floor {r.floor})
                    </option>
                  ))}
                </select>
                {selected.freeRooms.length === 0 ? <p className="mt-1 text-xs text-slate-600">No room of this type is free for every night, but a room can be chosen later.</p> : null}
              </div>
              {allotmentOptions.length > 0 ? (
                <div>
                  <Label htmlFor={`${ids}-allot`}>Book against a group allotment</Label>
                  <select id={`${ids}-allot`} className={hmsInput} value={allotmentId} onChange={(e) => setAllotmentId(e.target.value)}>
                    <option value="">No, a normal booking</option>
                    {allotmentOptions.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name} ({a.rooms} rooms held)
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}
            </div>
          ) : null}
          {selected && soldOut ? (
            <div className="mt-3">
              <HmsWarning title={overLimit ? "This room type is sold out" : "This is past the room count"}>
                {overLimit
                  ? "Booking it needs a manager to override the limit; you will be asked when you book."
                  : `The hotel allows up to ${selected.overbook} extra room${selected.overbook === 1 ? "" : "s"} to be sold for this type, so the booking can go ahead.`}
              </HmsWarning>
            </div>
          ) : null}
        </HmsCard>

        <HmsCard id="booking-guest" icon={UserRound} meaning="guests" title="3. The guest" description="ID details are collected when the guest checks in.">
          <div role="tablist" aria-label="Who is the guest" className="mb-3 inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1 text-sm">
            {(["search", "new"] as const).map((m) => (
              <button
                key={m}
                type="button"
                role="tab"
                aria-selected={mode === m}
                onClick={() => setMode(m)}
                className={`rounded-lg px-3 py-1.5 font-medium ${focusRing} ${mode === m ? "bg-white text-slate-900 shadow-sm" : "text-slate-600"}`}
              >
                {m === "search" ? "A guest on file" : "A new guest"}
              </button>
            ))}
          </div>

          {mode === "search" ? (
            <div>
              {picked ? (
                <div className="flex items-center justify-between gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm">
                  <div>
                    <p className="font-semibold text-slate-900">
                      {picked.name} {picked.isVip ? <HmsPill tone="amber">VIP</HmsPill> : null}
                    </p>
                    <p className="text-slate-700">
                      {[picked.phone, picked.email].filter(Boolean).join(" · ")} · {picked.visitCount} previous stay{picked.visitCount === 1 ? "" : "s"}
                      {picked.tier ? ` · ${picked.tier}` : ""}
                    </p>
                  </div>
                  <button type="button" className={hmsButton.small} onClick={() => setPicked(null)}>
                    Change
                  </button>
                </div>
              ) : (
                <>
                  <Label htmlFor={`${ids}-q`}>Search by name, phone, email or ID number</Label>
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" aria-hidden />
                    <input id={`${ids}-q`} type="search" className={`${hmsInput} pl-10`} value={query} onChange={(e) => setQuery(e.target.value)} autoComplete="off" />
                  </div>
                  {query.trim().length >= 2 ? (
                    hits.length > 0 ? (
                      <ul className="mt-2 divide-y divide-slate-100 rounded-xl border border-slate-200 text-sm">
                        {hits.map((g) => (
                          <li key={g.id}>
                            <button type="button" onClick={() => setPicked(g)} className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left hover:bg-slate-50 ${focusRing}`}>
                              <span>
                                <span className="font-medium text-slate-900">{g.name}</span>
                                <span className="block text-slate-600">{[g.phone, g.email].filter(Boolean).join(" · ")}</span>
                              </span>
                              <span className="text-xs text-slate-600">{g.visitCount} stay{g.visitCount === 1 ? "" : "s"}</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-2 text-sm text-slate-600">
                        No one found.{" "}
                        <button type="button" className="font-medium text-blue-700 underline" onClick={() => setMode("new")}>
                          Add a new guest
                        </button>
                      </p>
                    )
                  ) : null}
                </>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor={`${ids}-fn`}>First name</Label>
                <input id={`${ids}-fn`} className={hmsInput} value={first} onChange={(e) => setFirst(e.target.value)} autoComplete="off" />
              </div>
              <div>
                <Label htmlFor={`${ids}-ln`}>Last name</Label>
                <input id={`${ids}-ln`} className={hmsInput} value={last} onChange={(e) => setLast(e.target.value)} autoComplete="off" />
              </div>
              <div>
                <Label htmlFor={`${ids}-ph`}>Phone</Label>
                <input id={`${ids}-ph`} type="tel" className={hmsInput} value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="off" />
              </div>
              <div>
                <Label htmlFor={`${ids}-em`}>Email</Label>
                <input id={`${ids}-em`} type="email" className={hmsInput} value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" />
              </div>
              <p className="text-xs text-slate-600 sm:col-span-2">A phone number or an email address is enough. If this person is already on file, the booking is added to their profile.</p>
            </div>
          )}
        </HmsCard>

        <HmsCard id="booking-details" icon={CalendarDays} meaning="rooms" title="4. Details">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor={`${ids}-src`}>Where did the booking come from?</Label>
              <select id={`${ids}-src`} className={hmsInput} value={source} onChange={(e) => setSource(e.target.value as BookingSource)}>
                {sourceOptions.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
            {source === "travel_agent" ? (
              <div>
                <Label htmlFor={`${ids}-agent`}>Travel agent</Label>
                <select id={`${ids}-agent`} className={hmsInput} value={agentId} onChange={(e) => setAgentId(e.target.value)}>
                  <option value="">Choose an agent</option>
                  {agents.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
                {agents.length === 0 ? <p className="mt-1 text-xs text-slate-600">Add agents under Reservation settings.</p> : null}
              </div>
            ) : null}
            <div className="sm:col-span-2">
              <Label htmlFor={`${ids}-notes`}>Requests and notes</Label>
              <textarea id={`${ids}-notes`} rows={3} maxLength={1000} className={hmsInput} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Late arrival, extra bed, anniversary, allergies…" />
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-800">
              <input type="checkbox" checked={vip} onChange={(e) => setVip(e.target.checked)} />
              VIP guest
            </label>
          </div>
        </HmsCard>
      </div>

      <aside className="lg:sticky lg:top-4 lg:self-start" aria-label="Booking summary">
        <HmsCard id="booking-summary" icon={CheckCircle2} meaning="rooms" title="Summary">
          <dl className="space-y-2 text-sm">
            <div>
              <dt className="text-slate-600">Stay</dt>
              <dd className="font-medium text-slate-900">{nights > 0 ? `${formatDayShort(arrival)} to ${formatDayShort(departure)} (${nights} night${nights === 1 ? "" : "s"})` : "Choose dates"}</dd>
            </div>
            <div>
              <dt className="text-slate-600">Room</dt>
              <dd className="font-medium text-slate-900">{selected ? `${selected.name}${roomId ? ` · ${selected.freeRooms.find((r) => r.id === roomId)?.roomCode ?? ""}` : ""}` : "Not chosen"}</dd>
            </div>
            <div>
              <dt className="text-slate-600">Guest</dt>
              <dd className="font-medium text-slate-900">{mode === "search" ? (picked?.name ?? "Not chosen") : `${first} ${last}`.trim() || "Not entered"}</dd>
            </div>
            {selected ? (
              <>
                <div>
                  <dt className="text-slate-600">Room charges</dt>
                  <dd className="font-medium text-slate-900">{formatPricingAmount(selected.roomTotal, currency)}</dd>
                </div>
                <div>
                  <dt className="text-slate-600">Taxes and service charge</dt>
                  <dd className="font-medium text-slate-900">{formatPricingAmount(selected.taxTotal, currency)}</dd>
                </div>
                <div className="rounded-lg bg-slate-50 p-2">
                  <dt className="text-slate-600">Total</dt>
                  <dd className="text-base font-semibold text-slate-900">{formatPricingAmount(selected.grandTotal, currency)}</dd>
                </div>
                {selected.depositRequired > 0 ? (
                  <div>
                    <dt className="text-slate-600">Deposit asked for</dt>
                    <dd className="font-medium text-slate-900">
                      {formatPricingAmount(selected.depositRequired, currency)}
                      {selected.depositDueDate ? `, by ${formatDayShort(selected.depositDueDate)}` : ""}
                    </dd>
                  </div>
                ) : null}
                <div>
                  <dt className="text-slate-600">Cancellation</dt>
                  <dd className="text-slate-800">
                    <ul className="list-disc space-y-0.5 pl-4">
                      {selected.cancellationLines.map((l) => (
                        <li key={l}>{l}</li>
                      ))}
                    </ul>
                  </dd>
                </div>
              </>
            ) : null}
          </dl>

          <label className="mt-4 flex items-start gap-2 text-sm text-slate-800">
            <input type="checkbox" className="mt-1" checked={sendEmail} onChange={(e) => setSendEmail(e.target.checked)} />
            <span>Email the guest a confirmation</span>
          </label>

          {error ? (
            <p role="alert" className="mt-3 text-sm text-red-700">
              {error}
            </p>
          ) : null}

          {override ? (
            <div className="mt-3 space-y-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm">
              <p className="font-medium text-slate-900">{restrictionOverride ? "A manager can sell this stay despite the rate restriction" : "A manager can override the limit"}</p>
              <div>
                <Label htmlFor={`${ids}-ovr`}>Reason</Label>
                <input id={`${ids}-ovr`} className={hmsInput} value={override.reason} onChange={(e) => setOverride({ ...override, reason: e.target.value })} placeholder="For example: expecting two no-shows" />
              </div>
              <div>
                <Label htmlFor={`${ids}-pin`}>Manager&apos;s PIN (not needed for owners and admins)</Label>
                <input id={`${ids}-pin`} type="password" inputMode="numeric" autoComplete="off" className={`${hmsInput} max-w-40`} value={override.pin} onChange={(e) => setOverride({ ...override, pin: e.target.value })} />
              </div>
              <button type="button" className={hmsButton.primary} disabled={busy || !override.reason.trim()} onClick={() => void submit(override)}>
                Override and book
              </button>
            </div>
          ) : null}

          <button type="button" className={`${hmsButton.primary} mt-4 w-full`} disabled={!canBook} onClick={() => void submit(null)}>
            {busy ? "Booking…" : "Book it"}
          </button>
          {!canBook && selected ? <p className="mt-2 text-xs text-slate-600">{guestReady ? "" : "Choose or enter the guest to book."}</p> : null}
        </HmsCard>
      </aside>
    </div>
  );
}

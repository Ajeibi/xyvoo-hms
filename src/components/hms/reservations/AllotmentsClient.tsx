"use client";

import Link from "next/link";
import { useState } from "react";
import { hmsButton, hmsInput } from "@/components/hms/hms-ui";
import { toastError, toastSuccess } from "@/lib/app-toast";
import { formatDayShort } from "@/lib/hms/reservation-availability-shared";
import type { AllotmentRow } from "@/lib/hms/reservation-allotments";

type RoomTypeOption = { id: string; name: string };

const STATE_LABEL: Record<AllotmentRow["state"], string> = {
  holding: "Holding rooms",
  released: "Released",
  cancelled: "Cancelled",
  ended: "Ended",
};
const STATE_CLASS: Record<AllotmentRow["state"], string> = {
  holding: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  released: "bg-amber-50 text-amber-800 ring-amber-200",
  cancelled: "bg-slate-100 text-slate-700 ring-slate-200",
  ended: "bg-slate-100 text-slate-700 ring-slate-200",
};

async function post(url: string, body: unknown) {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, data };
}

/** Rooms held for groups: how many each has picked up, when the rest go back on sale, and a pasted rooming list. */
export function AllotmentsClient({
  slug,
  initial,
  roomTypes,
  canManage,
  today,
}: {
  slug: string;
  initial: AllotmentRow[];
  roomTypes: RoomTypeOption[];
  canManage: boolean;
  today: string;
}) {
  const [rows, setRows] = useState(initial);
  const [showForm, setShowForm] = useState(false);
  const typeName = (id: string) => roomTypes.find((t) => t.id === id)?.name ?? id;

  return (
    <div className="space-y-4">
      {canManage ? (
        <div>
          <button type="button" className={hmsButton.primary} onClick={() => setShowForm((v) => !v)} aria-expanded={showForm}>
            {showForm ? "Close" : "Hold rooms for a group"}
          </button>
        </div>
      ) : null}
      {showForm ? (
        <NewAllotmentForm
          slug={slug}
          roomTypes={roomTypes}
          today={today}
          onDone={(next) => {
            setRows(next);
            setShowForm(false);
          }}
        />
      ) : null}
      {rows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-600">
          No rooms are being held for groups. Hold a block of rooms for a wedding, a team or a tour, add the guests when you have the list, and let the rest go back on sale on a date you choose.
        </p>
      ) : (
        <ul className="space-y-3">
          {rows.map((a) => (
            <AllotmentCard key={a.id} a={a} slug={slug} canManage={canManage} typeName={typeName(a.roomTypeCode)} onChange={setRows} />
          ))}
        </ul>
      )}
    </div>
  );
}

function NewAllotmentForm({ slug, roomTypes, today, onDone }: { slug: string; roomTypes: RoomTypeOption[]; today: string; onDone: (rows: AllotmentRow[]) => void }) {
  const [f, setF] = useState({ name: "", contactName: "", contactPhone: "", contactEmail: "", roomTypeCode: roomTypes[0]?.id ?? "", rooms: "5", startDate: today, endDate: "", releaseDate: "", notes: "" });
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF((p) => ({ ...p, [k]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { ok, data } = await post("/api/hotel/reservations/allotments", {
      slug,
      name: f.name,
      contactName: f.contactName || null,
      contactPhone: f.contactPhone || null,
      contactEmail: f.contactEmail || null,
      roomTypeCode: f.roomTypeCode,
      rooms: Number(f.rooms),
      startDate: f.startDate,
      endDate: f.endDate,
      releaseDate: f.releaseDate || null,
      notes: f.notes || null,
    });
    setBusy(false);
    if (!ok) return toastError("Not saved", data.error ?? "Please try again.");
    toastSuccess("Rooms held", "The rooms are held until the release date.");
    onDone(data.allotments ?? []);
  };

  const field = "block text-sm font-medium text-slate-800";
  return (
    <form onSubmit={submit} className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-2">
      <label className={`${field} sm:col-span-2`}>
        Group or company
        <input className={`${hmsInput} mt-1`} value={f.name} onChange={set("name")} required maxLength={120} />
      </label>
      <label className={field}>
        Contact name
        <input className={`${hmsInput} mt-1`} value={f.contactName} onChange={set("contactName")} />
      </label>
      <label className={field}>
        Contact phone
        <input className={`${hmsInput} mt-1`} value={f.contactPhone} onChange={set("contactPhone")} inputMode="tel" />
      </label>
      <label className={field}>
        Room type
        <select className={`${hmsInput} mt-1`} value={f.roomTypeCode} onChange={set("roomTypeCode")} required>
          {roomTypes.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </label>
      <label className={field}>
        Rooms to hold
        <input className={`${hmsInput} mt-1`} type="number" min={1} max={500} inputMode="numeric" value={f.rooms} onChange={set("rooms")} required />
      </label>
      <label className={field}>
        First night
        <input className={`${hmsInput} mt-1`} type="date" min={today} value={f.startDate} onChange={set("startDate")} required />
      </label>
      <label className={field}>
        Departure day
        <input className={`${hmsInput} mt-1`} type="date" min={f.startDate} value={f.endDate} onChange={set("endDate")} required />
      </label>
      <label className={`${field} sm:col-span-2`}>
        Release unused rooms on
        <input className={`${hmsInput} mt-1`} type="date" max={f.startDate} value={f.releaseDate} onChange={set("releaseDate")} />
        <span className="mt-1 block text-xs font-normal text-slate-600">From this date any room nobody has been put in goes back on sale by itself. Leave it empty to hold the rooms until you release them.</span>
      </label>
      <label className={`${field} sm:col-span-2`}>
        Notes
        <textarea className={`${hmsInput} mt-1`} rows={2} value={f.notes} onChange={set("notes")} maxLength={1000} />
      </label>
      <div className="sm:col-span-2">
        <button type="submit" className={hmsButton.primary} disabled={busy || !f.name.trim() || !f.endDate}>
          {busy ? "Saving…" : "Hold the rooms"}
        </button>
      </div>
    </form>
  );
}

function AllotmentCard({ a, slug, canManage, typeName, onChange }: { a: AllotmentRow; slug: string; canManage: boolean; typeName: string; onChange: (rows: AllotmentRow[]) => void }) {
  const [busy, setBusy] = useState(false);
  const [list, setList] = useState("");
  const [open, setOpen] = useState(false);
  const [release, setRelease] = useState(a.releaseDate ?? "");
  const [report, setReport] = useState<{ made: { code: string; name: string }[]; skipped: string[] } | null>(null);
  const left = Math.max(0, a.rooms - a.pickedUp);
  const live = a.state === "holding";

  const act = async (body: Record<string, unknown>, okMessage: string) => {
    setBusy(true);
    const { ok, data } = await post(`/api/hotel/reservations/allotments/${a.id}`, { slug, ...body });
    setBusy(false);
    if (!ok) {
      toastError("Not done", data.error ?? "Please try again.");
      return null;
    }
    toastSuccess("Done", okMessage);
    if (data.allotments) onChange(data.allotments);
    return data;
  };

  return (
    <li className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-slate-900">{a.name}</h3>
          <p className="text-sm text-slate-600">
            {a.rooms} × {typeName}, {formatDayShort(a.startDate)} to {formatDayShort(a.endDate)}
            {a.contactName ? ` · ${a.contactName}` : ""}
            {a.contactPhone ? ` · ${a.contactPhone}` : ""}
          </p>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${STATE_CLASS[a.state]}`}>{STATE_LABEL[a.state]}</span>
      </div>

      <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm text-slate-700">
        <span>
          <strong>{a.pickedUp}</strong> picked up
        </span>
        <span>
          <strong>{left}</strong> still open
        </span>
        {a.releaseDate ? (
          <span>
            Rooms left go back on sale {formatDayShort(a.releaseDate)}
            {live && a.daysToRelease !== null ? ` (${a.daysToRelease <= 0 ? "today" : `in ${a.daysToRelease} day${a.daysToRelease === 1 ? "" : "s"}`})` : ""}
          </span>
        ) : live ? (
          <span>No release date</span>
        ) : null}
      </div>

      {a.bookings.length > 0 ? (
        <ul className="mt-3 divide-y divide-slate-100 rounded-lg border border-slate-100 text-sm">
          {a.bookings.map((b) => (
            <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
              <span>{b.guestName}</span>
              <Link href={`/hms/${slug}/reservations/${b.id}`} className="font-medium text-blue-700 hover:underline">
                {b.code}
              </Link>
            </li>
          ))}
        </ul>
      ) : null}

      {live ? (
        <div className="mt-3 space-y-3">
          <div className="flex flex-wrap gap-2">
            <button type="button" className={hmsButton.small} onClick={() => setOpen((v) => !v)} aria-expanded={open} disabled={left === 0}>
              {open ? "Hide rooming list" : "Add rooming list"}
            </button>
            {canManage ? (
              <>
                <button
                  type="button"
                  className={hmsButton.small}
                  disabled={busy}
                  onClick={() => {
                    if (window.confirm(`Release the ${left} unused room${left === 1 ? "" : "s"} now? They go back on sale straight away.`)) void act({ action: "release" }, "The unused rooms are back on sale.");
                  }}
                >
                  Release unused rooms now
                </button>
                <button
                  type="button"
                  className={hmsButton.small}
                  disabled={busy}
                  onClick={() => {
                    if (window.confirm("Cancel this allotment? Bookings already made stay, the hold on rooms ends.")) void act({ action: "cancel" }, "The allotment is cancelled.");
                  }}
                >
                  Cancel allotment
                </button>
              </>
            ) : null}
          </div>
          {canManage ? (
            <div className="flex flex-wrap items-end gap-2">
              <label className="text-sm font-medium text-slate-800">
                Release date
                <input type="date" className={`${hmsInput} mt-1`} max={a.startDate} value={release} onChange={(e) => setRelease(e.target.value)} />
              </label>
              <button type="button" className={hmsButton.small} disabled={busy || release === (a.releaseDate ?? "")} onClick={() => act({ action: "update", releaseDate: release || null }, "The release date is saved.")}>
                Save date
              </button>
            </div>
          ) : null}
          {open ? (
            <div className="space-y-2">
              <label className="block text-sm font-medium text-slate-800">
                One guest a line: name, then phone or email
                <textarea className={`${hmsInput} mt-1 font-mono`} rows={6} value={list} onChange={(e) => setList(e.target.value)} placeholder={"Ada Obi, 0803 000 0000\nTunde Bello, tunde@example.com"} />
              </label>
              <button
                type="button"
                className={hmsButton.primary}
                disabled={busy || !list.trim()}
                onClick={async () => {
                  const data = await act({ action: "rooming_list", text: list }, "The rooming list is added.");
                  if (data) {
                    setReport({ made: data.made ?? [], skipped: data.skipped ?? [] });
                    if ((data.skipped ?? []).length === 0) setList("");
                  }
                }}
              >
                {busy ? "Adding…" : "Make the bookings"}
              </button>
              {report ? (
                <div role="status" className="text-sm text-slate-700">
                  <p>
                    {report.made.length} booking{report.made.length === 1 ? "" : "s"} made.
                  </p>
                  {report.skipped.length > 0 ? (
                    <ul className="mt-1 list-disc pl-5 text-amber-800">
                      {report.skipped.map((s) => (
                        <li key={s}>{s}</li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import { ExternalLink, Loader2, Package, PackageCheck } from "lucide-react";
import { HmsAlert, HmsCard, HmsField, HmsPage, HmsPageHeader, HmsPill, hmsButton, hmsInput } from "@/components/hms/hms-ui";
import { toastError, toastSuccess } from "@/lib/app-toast";
import {
  isParcelOverdue,
  PARCEL_STATUS_LABEL,
  parcelWaitingDays,
  type GuestParcel,
} from "@/lib/hms/guest-parcels-shared";
import type { MessageChannel, MessageRecipient } from "@/lib/hms/guest-messages-shared";

type Notice = { status: "sent" | "prepared" | "failed"; link?: string; error?: string } | null;

function when(iso: string) {
  return new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

function LogParcel({ slug, recipients, onLogged }: { slug: string; recipients: MessageRecipient[]; onLogged: () => void }) {
  const [reservationId, setReservationId] = useState("");
  const [recipientName, setRecipientName] = useState("");
  const [description, setDescription] = useState("");
  const [carrier, setCarrier] = useState("");
  const [shelf, setShelf] = useState("");
  const [notify, setNotify] = useState<"" | MessageChannel>("email");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/hotel/frontdesk/parcels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug,
          reservationId: reservationId || undefined,
          recipientName: reservationId ? undefined : recipientName,
          description,
          carrier: carrier || undefined,
          shelf: shelf || undefined,
          notify: reservationId && notify ? notify : undefined,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error ?? "Could not log the parcel.");
        return;
      }
      toastSuccess("Parcel logged");
      setNotice(json.notice ?? null);
      setDescription("");
      setCarrier("");
      setShelf("");
      setRecipientName("");
      setReservationId("");
      onLogged();
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <HmsField id="parcel-guest" label="For">
          <select id="parcel-guest" className={hmsInput} value={reservationId} onChange={(e) => setReservationId(e.target.value)}>
            <option value="">Someone else (type a name)</option>
            {recipients.map((r) => (
              <option key={r.reservationId} value={r.reservationId}>
                {r.name}
                {r.roomCode ? ` · Room ${r.roomCode}` : ""}
              </option>
            ))}
          </select>
        </HmsField>
        {!reservationId ? (
          <HmsField id="parcel-name" label="Name on the parcel">
            <input id="parcel-name" className={hmsInput} maxLength={120} value={recipientName} onChange={(e) => setRecipientName(e.target.value)} />
          </HmsField>
        ) : (
          <HmsField id="parcel-notify" label="Tell the guest">
            <select id="parcel-notify" className={hmsInput} value={notify} onChange={(e) => setNotify(e.target.value as "" | MessageChannel)}>
              <option value="email">By email</option>
              <option value="whatsapp">By WhatsApp</option>
              <option value="">Don&apos;t tell them yet</option>
            </select>
          </HmsField>
        )}
        <HmsField id="parcel-desc" label="What is it?">
          <input id="parcel-desc" className={hmsInput} maxLength={200} placeholder="Brown box, flowers, envelope…" value={description} onChange={(e) => setDescription(e.target.value)} />
        </HmsField>
        <HmsField id="parcel-carrier" label="Who brought it? (optional)">
          <input id="parcel-carrier" className={hmsInput} maxLength={80} placeholder="DHL, Glovo, a driver…" value={carrier} onChange={(e) => setCarrier(e.target.value)} />
        </HmsField>
        <HmsField id="parcel-shelf" label="Kept at (optional)">
          <input id="parcel-shelf" className={hmsInput} maxLength={40} placeholder="Shelf B" value={shelf} onChange={(e) => setShelf(e.target.value)} />
        </HmsField>
      </div>
      {error ? <HmsAlert message={error} /> : null}
      <button type="submit" className={hmsButton.primary} disabled={busy || !description.trim() || (!reservationId && !recipientName.trim())}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Package className="h-4 w-4" aria-hidden />}
        Log parcel
      </button>
      {notice?.status === "prepared" && notice.link ? (
        <a href={notice.link} target="_blank" rel="noopener noreferrer" className={hmsButton.secondary}>
          Open WhatsApp to tell the guest
          <ExternalLink className="h-3.5 w-3.5" aria-hidden />
        </a>
      ) : notice?.status === "failed" ? (
        <p className="text-sm text-amber-800">The guest could not be told: {notice.error ?? "no way to reach them"}.</p>
      ) : null}
    </form>
  );
}

function ParcelRow({ slug, parcel, onChanged }: { slug: string; parcel: GuestParcel; onChanged: () => void }) {
  const [collector, setCollector] = useState("");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const waiting = parcel.status === "received";

  async function patch(payload: Record<string, unknown>, done: string) {
    setBusy(true);
    try {
      const res = await fetch("/api/hotel/frontdesk/parcels", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, id: parcel.id, ...payload }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toastError("Not saved", json.error ?? "Try again.");
        return;
      }
      if (json.notice?.status === "prepared" && json.notice.link) setLink(json.notice.link);
      else if (json.notice?.status === "failed") toastError("Guest not told", json.notice.error ?? "No way to reach them.");
      else toastSuccess(done);
      setOpen(false);
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="space-y-2 px-3 py-3 text-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-medium text-slate-900">
            {parcel.description}
            <span className="font-normal text-slate-600">
              {" "}for {parcel.recipientName}
              {parcel.roomCode ? ` · Room ${parcel.roomCode}` : ""}
            </span>
          </p>
          <p className="text-slate-600">
            Arrived {when(parcel.receivedAt)}
            {parcel.carrier ? ` · ${parcel.carrier}` : ""}
            {parcel.shelf ? ` · ${parcel.shelf}` : ""}
            {parcel.notifiedAt ? ` · guest told by ${parcel.notifiedChannel}` : ""}
          </p>
          {!waiting ? (
            <p className="text-slate-600">
              {parcel.status === "collected" ? `Collected by ${parcel.collectedByName ?? "someone"}` : "Sent back"}
              {parcel.collectedAt ? ` · ${when(parcel.collectedAt)}` : ""}
            </p>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          {isParcelOverdue(parcel) ? <HmsPill tone="amber">{parcelWaitingDays(parcel.receivedAt)} days</HmsPill> : null}
          <HmsPill tone={waiting ? "blue" : "green"}>{PARCEL_STATUS_LABEL[parcel.status]}</HmsPill>
        </div>
      </div>

      {waiting ? (
        <div className="flex flex-wrap items-center gap-2">
          {open ? (
            <>
              <input
                aria-label="Who collected it"
                className={hmsInput}
                style={{ maxWidth: 260 }}
                maxLength={120}
                placeholder="Who is collecting it?"
                value={collector}
                onChange={(e) => setCollector(e.target.value)}
              />
              <button type="button" className={hmsButton.primary} disabled={busy || !collector.trim()} onClick={() => void patch({ action: "collect", collectedByName: collector }, "Handed over")}>
                <PackageCheck className="h-4 w-4" aria-hidden />
                Hand over
              </button>
              <button type="button" className={hmsButton.secondary} onClick={() => setOpen(false)}>
                Cancel
              </button>
            </>
          ) : (
            <>
              <button type="button" className={hmsButton.primary} onClick={() => { setCollector(parcel.recipientName); setOpen(true); }}>
                Hand over
              </button>
              {parcel.reservationId ? (
                <button type="button" className={hmsButton.secondary} disabled={busy} onClick={() => void patch({ action: "notify", channel: "email" }, "Guest emailed")}>
                  {parcel.notifiedAt ? "Remind by email" : "Tell by email"}
                </button>
              ) : null}
              {parcel.reservationId ? (
                <button type="button" className={hmsButton.secondary} disabled={busy} onClick={() => void patch({ action: "notify", channel: "whatsapp" }, "Chat ready")}>
                  WhatsApp
                </button>
              ) : null}
              <button type="button" className={hmsButton.secondary} disabled={busy} onClick={() => { if (window.confirm("Mark this parcel as sent back?")) void patch({ action: "return" }, "Marked as sent back"); }}>
                Send back
              </button>
            </>
          )}
          {link ? (
            <a href={link} target="_blank" rel="noopener noreferrer" className={hmsButton.secondary}>
              Open WhatsApp
              <ExternalLink className="h-3.5 w-3.5" aria-hidden />
            </a>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

export function FrontDeskParcelsClient({ slug }: { slug: string }) {
  const [parcels, setParcels] = useState<GuestParcel[]>([]);
  const [recipients, setRecipients] = useState<MessageRecipient[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/hotel/frontdesk/parcels?slug=${encodeURIComponent(slug)}`, { cache: "no-store" });
      const json = await res.json();
      setParcels(json.parcels ?? []);
      setRecipients(json.recipients ?? []);
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    void load();
  }, [load]);

  const waiting = parcels.filter((p) => p.status === "received");
  const done = parcels.filter((p) => p.status !== "received");

  return (
    <HmsPage wide>
      <HmsPageHeader
        eyebrow="Front desk"
        meaning="guests"
        title="Parcels"
        description="Log what is left at the desk for guests, tell them it has come, and write down who collected it."
      />

      <HmsCard id="log-parcel" icon={Package} meaning="guests" title="A parcel has arrived" description="Pick the guest, say what it is, and they are told straight away.">
        <LogParcel slug={slug} recipients={recipients} onLogged={() => void load()} />
      </HmsCard>

      <HmsCard
        id="waiting-parcels"
        icon={PackageCheck}
        meaning="guests"
        title="Waiting at the desk"
        description={loading ? "Loading…" : `${waiting.length} parcel${waiting.length === 1 ? "" : "s"} waiting to be collected.`}
      >
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin text-slate-500" aria-label="Loading" />
        ) : waiting.length === 0 ? (
          <p className="text-sm text-slate-600">Nothing is waiting.</p>
        ) : (
          <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
            {waiting.map((p) => (
              <ParcelRow key={p.id} slug={slug} parcel={p} onChanged={() => void load()} />
            ))}
          </ul>
        )}
      </HmsCard>

      {done.length > 0 ? (
        <HmsCard id="handed-over" icon={PackageCheck} meaning="guests" title="Recently handed over" description="The latest parcels collected or sent back, with who took them.">
          <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
            {done.map((p) => (
              <ParcelRow key={p.id} slug={slug} parcel={p} onChanged={() => void load()} />
            ))}
          </ul>
        </HmsCard>
      ) : null}
    </HmsPage>
  );
}

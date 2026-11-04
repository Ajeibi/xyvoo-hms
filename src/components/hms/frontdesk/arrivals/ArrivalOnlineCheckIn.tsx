"use client";

import { useCallback, useEffect, useState } from "react";
import { ExternalLink, Loader2 } from "lucide-react";
import { HmsPill, hmsButton } from "@/components/hms/hms-ui";
import { toastError, toastSuccess } from "@/lib/app-toast";
import { formatDateTime } from "@/lib/format-date";
import { ONLINE_CHECKIN_STATUS_LABEL, type OnlineCheckIn } from "@/lib/hms/online-checkin-shared";
import { countryName } from "@/lib/store/countries";

/** Whether the guest has checked in online, what they sent, and a button to send the link. */
export function ArrivalOnlineCheckIn({ slug, reservationId, canSend }: { slug: string; reservationId: string; canSend: boolean }) {
  const url = `/api/hotel/frontdesk/arrivals/${reservationId}/online-checkin`;
  const [info, setInfo] = useState<OnlineCheckIn | null>(null);
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${url}?slug=${encodeURIComponent(slug)}`, { cache: "no-store" });
      const json = await res.json();
      setInfo(json.checkIn ?? null);
    } catch {
      setInfo(null);
    }
  }, [url, slug]);

  useEffect(() => {
    void load();
  }, [load]);

  async function send(channel: "email" | "whatsapp") {
    setBusy(true);
    try {
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ slug, channel }) });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toastError("Not sent", json.error ?? "Try again.");
        return;
      }
      if (json.link) setLink(json.link);
      else toastSuccess("Check-in link emailed");
      await load();
    } finally {
      setBusy(false);
    }
  }

  if (!info) return <Loader2 className="h-4 w-4 animate-spin text-slate-500" aria-label="Loading" />;
  const done = info.status === "completed";

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <HmsPill tone={done ? "green" : info.status === "sent" ? "blue" : "slate"}>{ONLINE_CHECKIN_STATUS_LABEL[info.status]}</HmsPill>
        {info.requestedAt && !done ? <span className="text-xs text-slate-600">Sent {formatDateTime(info.requestedAt)}{info.requestedChannel ? ` by ${info.requestedChannel}` : ""}</span> : null}
        {done && info.submittedAt ? <span className="text-xs text-slate-600">{formatDateTime(info.submittedAt)}</span> : null}
      </div>

      {done ? (
        <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
          <div><dt className="text-xs text-slate-600">Phone</dt><dd className="text-slate-900">{info.phone ?? "–"}</dd></div>
          <div><dt className="text-xs text-slate-600">Email</dt><dd className="text-slate-900">{info.email ?? "–"}</dd></div>
          <div><dt className="text-xs text-slate-600">Country</dt><dd className="text-slate-900">{info.nationality ? countryName(info.nationality) : "–"}</dd></div>
          <div><dt className="text-xs text-slate-600">Expected arrival</dt><dd className="text-slate-900">{info.arrivalTime ?? "Not said"}</dd></div>
          <div><dt className="text-xs text-slate-600">Signed</dt><dd className="text-slate-900">{info.signed ? "Yes" : "No"}</dd></div>
          <div><dt className="text-xs text-slate-600">ID photos</dt><dd className="text-slate-900">{info.idPhotos}{info.idRequired && info.idPhotos === 0 ? " (needed)" : ""}</dd></div>
          {info.requests ? <div className="sm:col-span-2"><dt className="text-xs text-slate-600">Notes from the guest</dt><dd className="text-slate-900">{info.requests}</dd></div> : null}
        </dl>
      ) : canSend ? (
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className={hmsButton.primary} disabled={busy} onClick={() => void send("email")}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
            {info.status === "sent" ? "Send again by email" : "Send by email"}
          </button>
          <button type="button" className={hmsButton.secondary} disabled={busy} onClick={() => void send("whatsapp")}>
            WhatsApp
          </button>
          {link ? (
            <a href={link} target="_blank" rel="noopener noreferrer" className={hmsButton.secondary}>
              Open WhatsApp
              <ExternalLink className="h-3.5 w-3.5" aria-hidden />
            </a>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

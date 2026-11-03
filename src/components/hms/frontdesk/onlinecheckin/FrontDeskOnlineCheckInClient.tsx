"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ExternalLink, Loader2, Smartphone } from "lucide-react";
import { HmsCard, HmsField, HmsPage, HmsPageHeader, HmsPill, hmsButton, hmsInput } from "@/components/hms/hms-ui";
import { toastError, toastSuccess } from "@/lib/app-toast";
import {
  ID_POLICIES,
  ID_POLICY_LABELS,
  ONLINE_CHECKIN_STATUS_LABEL,
  type IdPolicy,
  type OnlineCheckInStatus,
} from "@/lib/hms/online-checkin-shared";

type Arrival = {
  reservationId: string;
  confirmationCode: string;
  guestName: string;
  arrivalAt: string;
  daysAway: number;
  status: OnlineCheckInStatus;
  hasEmail: boolean;
  hasPhone: boolean;
  due: boolean;
};

type Settings = { idPolicy: IdPolicy; daysBefore: number };

const when = (iso: string) => new Date(iso).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
const away = (d: number) => (d === 0 ? "Today" : d === 1 ? "Tomorrow" : `In ${d} days`);

export function FrontDeskOnlineCheckInClient({ slug }: { slug: string }) {
  const [arrivals, setArrivals] = useState<Arrival[]>([]);
  const [settings, setSettings] = useState<Settings>({ idPolicy: "foreign", daysBefore: 2 });
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [links, setLinks] = useState<{ name: string; link: string }[]>([]);
  const [draft, setDraft] = useState<Settings | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/hotel/frontdesk/online-checkin?slug=${encodeURIComponent(slug)}`, { cache: "no-store" });
      const json = await res.json();
      setArrivals(json.arrivals ?? []);
      if (json.settings) setSettings(json.settings);
      setCanManage(Boolean(json.canManage));
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    void load();
  }, [load]);

  const waiting = useMemo(() => arrivals.filter((a) => a.status !== "completed"), [arrivals]);
  const dueNotSent = useMemo(() => arrivals.filter((a) => a.due && a.status === "not_sent"), [arrivals]);
  const name = (id: string) => arrivals.find((a) => a.reservationId === id)?.guestName ?? "Guest";

  async function send(ids: string[], channel: "email" | "whatsapp") {
    if (ids.length === 0) return;
    setBusy(true);
    setLinks([]);
    try {
      const res = await fetch("/api/hotel/frontdesk/online-checkin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, reservationIds: ids, channel }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toastError("Not sent", json.error ?? "Try again.");
        return;
      }
      const results = json.results as { reservationId: string; ok: boolean; link?: string; error?: string }[];
      const failed = results.filter((r) => !r.ok);
      if (channel === "whatsapp") setLinks(results.filter((r) => r.ok && r.link).map((r) => ({ name: name(r.reservationId), link: r.link as string })));
      else toastSuccess(`${results.length - failed.length} email${results.length - failed.length === 1 ? "" : "s"} sent`);
      if (failed.length > 0) toastError(`${failed.length} not sent`, failed[0].error ?? "Check their contact details.");
      setPicked(new Set());
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function saveSettings() {
    if (!draft) return;
    setBusy(true);
    try {
      const res = await fetch("/api/hotel/frontdesk/online-checkin", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, ...draft }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toastError("Not saved", json.error ?? "Try again.");
        return;
      }
      toastSuccess("Saved");
      setDraft(null);
      await load();
    } finally {
      setBusy(false);
    }
  }

  const toggle = (id: string) =>
    setPicked((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <HmsPage wide>
      <HmsPageHeader
        eyebrow="Front desk"
        meaning="guests"
        title="Online check-in"
        description="Send arriving guests a link to confirm their details, add an ID photo and sign from their phone before they come."
      />

      <HmsCard
        id="online-checkin-arrivals"
        icon={Smartphone}
        meaning="guests"
        title="Arriving in the next week"
        description={loading ? "Loading…" : `${arrivals.filter((a) => a.status === "completed").length} of ${arrivals.length} have checked in online.`}
        actions={
          dueNotSent.length > 0 ? (
            <button type="button" className={hmsButton.primary} disabled={busy} onClick={() => void send(dueNotSent.map((a) => a.reservationId), "email")}>
              Email everyone due ({dueNotSent.length})
            </button>
          ) : undefined
        }
      >
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin text-slate-500" aria-label="Loading" />
        ) : arrivals.length === 0 ? (
          <p className="text-sm text-slate-600">No bookings arrive in the next week.</p>
        ) : (
          <>
            <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
              {arrivals.map((a) => (
                <li key={a.reservationId} className="flex flex-wrap items-center justify-between gap-3 px-3 py-3 text-sm">
                  <label className="flex min-w-0 items-center gap-3">
                    {a.status !== "completed" ? (
                      <input type="checkbox" className="h-4 w-4" checked={picked.has(a.reservationId)} onChange={() => toggle(a.reservationId)} aria-label={`Select ${a.guestName}`} />
                    ) : (
                      <span className="w-4" aria-hidden />
                    )}
                    <span className="min-w-0">
                      <span className="block font-medium text-slate-900">{a.guestName}</span>
                      <span className="block text-xs text-slate-600">
                        {a.confirmationCode} · {when(a.arrivalAt)} · {away(a.daysAway)}
                        {!a.hasEmail && !a.hasPhone ? " · no contact details" : ""}
                      </span>
                    </span>
                  </label>
                  <div className="flex items-center gap-2">
                    {a.due && a.status === "not_sent" ? <HmsPill tone="amber">Due</HmsPill> : null}
                    <HmsPill tone={a.status === "completed" ? "green" : a.status === "sent" ? "blue" : "slate"}>{ONLINE_CHECKIN_STATUS_LABEL[a.status]}</HmsPill>
                  </div>
                </li>
              ))}
            </ul>
            {waiting.length > 0 ? (
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <button type="button" className={hmsButton.primary} disabled={busy || picked.size === 0} onClick={() => void send([...picked], "email")}>
                  Email selected ({picked.size})
                </button>
                <button type="button" className={hmsButton.secondary} disabled={busy || picked.size === 0} onClick={() => void send([...picked], "whatsapp")}>
                  WhatsApp selected
                </button>
              </div>
            ) : null}
            {links.length > 0 ? (
              <ul className="mt-4 space-y-2">
                {links.map((l) => (
                  <li key={l.link}>
                    <a href={l.link} target="_blank" rel="noopener noreferrer" className={hmsButton.secondary}>
                      Open WhatsApp for {l.name}
                      <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                    </a>
                  </li>
                ))}
              </ul>
            ) : null}
          </>
        )}
      </HmsCard>

      <HmsCard id="online-checkin-settings" icon={Smartphone} meaning="guests" title="How it works at your hotel" description="Who must add an ID photo, and how many days before arrival the link is due.">
        {draft ? (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              void saveSettings();
            }}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <HmsField id="oc-policy" label="Who must add a photo of their ID?">
                <select id="oc-policy" className={hmsInput} value={draft.idPolicy} onChange={(e) => setDraft({ ...draft, idPolicy: e.target.value as IdPolicy })}>
                  {ID_POLICIES.map((p) => (
                    <option key={p} value={p}>
                      {ID_POLICY_LABELS[p]}
                    </option>
                  ))}
                </select>
              </HmsField>
              <HmsField id="oc-days" label="Send the link this many days before arrival">
                <input id="oc-days" className={hmsInput} type="number" min={1} max={14} value={draft.daysBefore} onChange={(e) => setDraft({ ...draft, daysBefore: Number(e.target.value) })} />
              </HmsField>
            </div>
            <div className="flex gap-2">
              <button type="submit" className={hmsButton.primary} disabled={busy}>
                Save
              </button>
              <button type="button" className={hmsButton.secondary} onClick={() => setDraft(null)}>
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
            <p className="text-slate-800">
              ID photo required from: <strong>{ID_POLICY_LABELS[settings.idPolicy]}</strong>. Link due <strong>{settings.daysBefore}</strong> day{settings.daysBefore === 1 ? "" : "s"} before arrival.
            </p>
            {canManage ? (
              <button type="button" className={hmsButton.secondary} onClick={() => setDraft(settings)}>
                Change
              </button>
            ) : null}
          </div>
        )}
      </HmsCard>
    </HmsPage>
  );
}

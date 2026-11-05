"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { CalendarCheck, Link2, RefreshCw, TriangleAlert } from "lucide-react";
import { HmsCard, HmsPill, HmsStatStrip, HmsStatTile, HmsWarning, hmsButton } from "@/components/hms/hms-ui";
import type { ChannelStatus, InboxItem } from "@/lib/hms/channels/status";
import type { MappingTargets } from "@/lib/hms/channels/types";

type Props = {
  slug: string;
  status: ChannelStatus;
  roomTypes: { id: string; name: string }[];
  plans: { code: string; name: string; onSites: boolean }[];
  currency: string;
  keyReady: boolean;
  webhookUrl: string;
};

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Lagos" }) : "never");
const money = (n: number, c: string) => `${c} ${Math.round(n).toLocaleString("en-GB")}`;
const field = "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500";

export default function ChannelsClient({ slug, status, roomTypes, plans, currency, keyReady, webhookUrl }: Props) {
  const router = useRouter();
  const conn = status.connection;
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);
  const [propertyId, setPropertyId] = useState("");
  const [targets, setTargets] = useState<MappingTargets | null>(null);
  const [roomMap, setRoomMap] = useState<Record<string, { ext: string; cap: string }>>(() => Object.fromEntries(status.rooms.map((r) => [r.room_type_code, { ext: r.external_room_type_id, cap: r.max_rooms_for_channels === null ? "" : String(r.max_rooms_for_channels) }])));
  const [rateMap, setRateMap] = useState<Record<string, string>>(() => Object.fromEntries(status.rates.map((r) => [`${r.room_type_code}|${r.plan_code}`, r.external_rate_plan_id])));

  async function act(action: string, extra: Record<string, unknown> = {}, label = action): Promise<{ ok: boolean; data: Record<string, unknown> }> {
    setBusy(label);
    setNote(null);
    try {
      const res = await fetch("/api/hotel/channels", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ slug, action, ...extra }) });
      const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (!res.ok || data.error) {
        setNote({ tone: "bad", text: String(data.error ?? "That didn't work. Please try again.") });
        return { ok: false, data };
      }
      return { ok: true, data };
    } catch {
      setNote({ tone: "bad", text: "We couldn't reach the server. Check your connection and try again." });
      return { ok: false, data: {} };
    } finally {
      setBusy(null);
    }
  }

  async function connect() {
    const r = await act("connect", { propertyId });
    if (r.ok) {
      setNote({ tone: "ok", text: `Connected${r.data.name ? ` to ${String(r.data.name)}` : ""}. Now match your rooms and rates below.` });
      router.refresh();
    }
  }

  async function loadTargets() {
    const r = await act("targets", {}, "targets");
    if (r.ok) setTargets(r.data.targets as MappingTargets);
  }

  async function saveMaps() {
    const rooms = Object.entries(roomMap)
      .filter(([, v]) => v.ext)
      .map(([roomTypeCode, v]) => ({ roomTypeCode, externalRoomTypeId: v.ext, maxRoomsForChannels: v.cap.trim() === "" ? null : Math.max(0, Math.floor(Number(v.cap) || 0)) }));
    const rates = Object.entries(rateMap)
      .filter(([k, ext]) => ext && rooms.some((r) => r.roomTypeCode === k.split("|")[0]))
      .map(([k, externalRatePlanId]) => ({ roomTypeCode: k.split("|")[0], planCode: k.split("|")[1], externalRatePlanId }));
    const r = await act("save_maps", { rooms, rates }, "save");
    if (r.ok) {
      setNote({ tone: "ok", text: "Matching saved. Everything is queued to go out; press “Send changes now” to send it." });
      router.refresh();
    }
  }

  async function run(action: string, extra: Record<string, unknown>, okText: string) {
    const r = await act(action, extra);
    if (r.ok) {
      setNote({ tone: "ok", text: okText });
      router.refresh();
    }
  }

  const attention = status.inbox.filter((i) => i.status === "needs_attention");
  const roomChoices = targets?.roomTypes ?? [];

  return (
    <div className="space-y-6">
      {note ? (
        <p role="status" className={`rounded-xl border px-4 py-3 text-sm ${note.tone === "ok" ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-red-200 bg-red-50 text-red-800"}`}>
          {note.text}
        </p>
      ) : null}

      {attention.length > 0 ? (
        <HmsWarning title={`${attention.length} booking${attention.length === 1 ? "" : "s"} from the sites need${attention.length === 1 ? "s" : ""} you`}>
          These were not added to your rooms automatically. Read what happened below and act on each one.
        </HmsWarning>
      ) : null}

      <HmsCard title="Connection" icon={Link2} meaning="rooms" description="One connection to a channel manager reaches Booking.com, Expedia and the rest. Your hotel is set up there first; paste its property id here.">
        {!keyReady ? (
          <HmsWarning title="The server isn't ready yet">The channel manager key is not set on the server (CHANNEX_API_KEY). Add it, redeploy, then come back.</HmsWarning>
        ) : !conn ? (
          <div className="flex flex-wrap items-end gap-3">
            <label className="min-w-64 flex-1 text-sm font-medium text-slate-700">
              Property id from the channel manager
              <input className={`${field} mt-1`} value={propertyId} onChange={(e) => setPropertyId(e.target.value)} placeholder="716305c4-561a-4561-a187-7f5b8aeb5920" autoComplete="off" />
            </label>
            <button type="button" className={hmsButton.primary} disabled={busy !== null || propertyId.trim().length < 8} onClick={connect}>
              {busy === "connect" ? "Connecting…" : "Connect"}
            </button>
          </div>
        ) : (
          <div className="space-y-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <HmsPill tone={conn.status === "active" ? "green" : "amber"}>{conn.status === "active" ? "Connected" : "Paused"}</HmsPill>
              <span className="text-slate-600">Property {conn.external_property_id}</span>
              <span className="text-slate-500">Last tested {when(conn.last_tested_at)}</span>
            </div>
            {conn.last_error ? (
              <p className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-amber-900">
                <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                <span>
                  {conn.last_error} <span className="text-amber-700">({when(conn.last_error_at)})</span>
                </span>
              </p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <button type="button" className={hmsButton.small} disabled={busy !== null} onClick={() => run("test", {}, "The connection works.")}>
                Test connection
              </button>
              <button type="button" className={hmsButton.small} disabled={busy !== null} onClick={() => run("pause", { paused: conn.status === "active" }, conn.status === "active" ? "Paused. Nothing is sent or received until you resume." : "Resumed.")}>
                {conn.status === "active" ? "Pause" : "Resume"}
              </button>
              <button
                type="button"
                className={hmsButton.danger}
                disabled={busy !== null}
                onClick={() => {
                  if (window.confirm("Disconnect from the channel manager? Nothing will be sent or received. Bookings already made stay in your reservations.")) void run("disconnect", {}, "Disconnected.");
                }}
              >
                Disconnect
              </button>
            </div>
            <p className="text-xs text-slate-500">
              In the channel manager, point the booking webhook at <code className="rounded bg-slate-100 px-1">{webhookUrl}</code> so new bookings arrive within seconds. Without it they still arrive when the system checks (about once a day, or when you press “Check for bookings”).
            </p>
          </div>
        )}
      </HmsCard>

      {conn ? (
        <HmsCard title="Match your rooms and rates" icon={Link2} meaning="neutral" description="Tell us which channel room is which of yours. Only matched rooms and rates are sold on the sites. “Most rooms the sites may see” keeps rooms back for direct bookings; leave it empty for no limit.">
          <div className="mb-3 flex flex-wrap gap-2">
            <button type="button" className={hmsButton.secondary} disabled={busy !== null} onClick={loadTargets}>
              {busy === "targets" ? "Loading…" : targets ? "Reload channel rooms" : "Load channel rooms"}
            </button>
          </div>
          {!targets && status.rooms.length === 0 ? <p className="text-sm text-slate-600">Press “Load channel rooms” to see the rooms you set up at the channel manager.</p> : null}
          {targets || status.rooms.length > 0 ? (
            <div className="space-y-4">
              {roomTypes.map((rt) => {
                const m = roomMap[rt.id] ?? { ext: "", cap: "" };
                const choices = roomChoices.length ? roomChoices : m.ext ? [{ id: m.ext, title: m.ext }] : [];
                const ratesFor = (targets?.ratePlans ?? []).filter((p) => p.roomTypeId === m.ext);
                return (
                  <fieldset key={rt.id} className="rounded-xl border border-slate-200 p-3">
                    <legend className="px-1 text-sm font-semibold text-slate-800">{rt.name}</legend>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="text-sm font-medium text-slate-700">
                        Channel room
                        <select className={`${field} mt-1`} value={m.ext} onChange={(e) => setRoomMap((s) => ({ ...s, [rt.id]: { ext: e.target.value, cap: s[rt.id]?.cap ?? "" } }))}>
                          <option value="">Not sold on the sites</option>
                          {choices.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.title}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="text-sm font-medium text-slate-700">
                        Most rooms the sites may see
                        <input className={`${field} mt-1`} inputMode="numeric" value={m.cap} placeholder="No limit" disabled={!m.ext} onChange={(e) => setRoomMap((s) => ({ ...s, [rt.id]: { ext: s[rt.id]?.ext ?? "", cap: e.target.value.replace(/\D/g, "") } }))} />
                      </label>
                    </div>
                    {m.ext ? (
                      <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        {plans.map((p) => {
                          const key = `${rt.id}|${p.code}`;
                          const options = ratesFor.length ? ratesFor : rateMap[key] ? [{ id: rateMap[key], title: rateMap[key], roomTypeId: m.ext }] : [];
                          return (
                            <label key={p.code} className="text-sm font-medium text-slate-700">
                              {p.name} <span className="font-normal text-slate-500">({p.code})</span>
                              <select className={`${field} mt-1`} value={rateMap[key] ?? ""} onChange={(e) => setRateMap((s) => ({ ...s, [key]: e.target.value }))}>
                                <option value="">Not sold on the sites</option>
                                {options.map((o) => (
                                  <option key={o.id} value={o.id}>
                                    {o.title}
                                  </option>
                                ))}
                              </select>
                              {!p.onSites ? <span className="mt-1 block text-xs text-amber-700">This rate is switched off for booking sites in Revenue, so it will show as closed.</span> : null}
                            </label>
                          );
                        })}
                      </div>
                    ) : null}
                  </fieldset>
                );
              })}
              <button type="button" className={hmsButton.primary} disabled={busy !== null} onClick={saveMaps}>
                {busy === "save" ? "Saving…" : "Save matching"}
              </button>
            </div>
          ) : null}
        </HmsCard>
      ) : null}

      {conn ? (
        <>
          <HmsStatStrip label="What we send">
            <HmsStatTile label="Waiting to send" value={status.outbox.pending} hint="Calls in the queue" icon={RefreshCw} meaning="neutral" />
            <HmsStatTile label="Sent in 24 hours" value={status.outbox.sentLastDay} hint={`Last: ${when(status.outbox.lastSentAt)}`} icon={RefreshCw} meaning="rooms" />
            <HmsStatTile label="Failed" value={status.outbox.failed} hint={status.outbox.lastError ?? "None"} icon={TriangleAlert} meaning="neutral" status={status.outbox.failed > 0 ? "warning" : undefined} statusText="Needs a retry" />
            <HmsStatTile label="Bookings to look at" value={status.needAttention} hint="From the sites" icon={CalendarCheck} meaning="neutral" status={status.needAttention > 0 ? "warning" : undefined} statusText="Open below" />
          </HmsStatStrip>

          <HmsCard title="Send and receive" icon={RefreshCw} meaning="rooms" description="Changes to bookings, rooms, blocks, prices and rules are noticed automatically and queued. These buttons send them now.">
            <div className="flex flex-wrap gap-2">
              <button type="button" className={hmsButton.primary} disabled={busy !== null || status.rooms.length === 0} onClick={() => run("sync", {}, "Changes sent.")}>
                {busy === "sync" ? "Sending…" : "Send changes now"}
              </button>
              <button type="button" className={hmsButton.secondary} disabled={busy !== null} onClick={() => run("check", {}, "Checked for new bookings.")}>
                Check for bookings
              </button>
              <button
                type="button"
                className={hmsButton.secondary}
                disabled={busy !== null || status.rooms.length === 0}
                onClick={() => {
                  if (window.confirm("Send every night for the next 500 days again? Use this after big changes. It can take a minute.")) void run("sync", { full: true }, "Everything has been queued and sent.");
                }}
              >
                Send everything again
              </button>
              {status.outbox.failed > 0 ? (
                <button type="button" className={hmsButton.secondary} disabled={busy !== null} onClick={() => run("retry_failed", {}, "Failed calls were put back in the queue and sent.")}>
                  Retry failed
                </button>
              ) : null}
            </div>
            <p className="mt-3 text-xs text-slate-500">Last full send: {when(conn.last_full_sync_at)}. Last check for bookings: {when(conn.last_poll_at)}. A full send also runs once a night.</p>
          </HmsCard>

          <HmsCard title="Bookings from the sites" icon={CalendarCheck} meaning="rooms" description="Every message that arrived: new bookings, changes and cancellations. Each is a real reservation once placed. The same message arriving twice does nothing the second time.">
            {status.inbox.length === 0 ? (
              <p className="text-sm text-slate-600">Nothing has arrived yet.</p>
            ) : (
              <ul className="divide-y divide-slate-100 text-sm">
                {status.inbox.map((i) => (
                  <InboxRow key={i.id} item={i} slug={slug} busy={busy !== null} onRetry={() => run("retry_message", { id: i.id }, "Tried again.")} onDone={() => run("message_done", { id: i.id }, "Marked as handled.")} />
                ))}
              </ul>
            )}
          </HmsCard>

          <HmsCard title="Production by site (last 90 days)" meaning="neutral" description="Bookings, nights and what the sites say they are worth. The site's own price is shown; your own bill uses your rate plan.">
            {status.production.length === 0 ? (
              <p className="text-sm text-slate-600">No bookings from the sites yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[480px] text-left text-sm">
                  <thead className="text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="py-2 pr-3">Site</th>
                      <th className="py-2 pr-3 text-right">Bookings</th>
                      <th className="py-2 pr-3 text-right">Nights</th>
                      <th className="py-2 pr-3 text-right">Value</th>
                      <th className="py-2 text-right">Cancelled</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {status.production.map((p) => (
                      <tr key={p.channel}>
                        <td className="py-2 pr-3 font-medium">{p.channel}</td>
                        <td className="py-2 pr-3 text-right tabular-nums">{p.bookings}</td>
                        <td className="py-2 pr-3 text-right tabular-nums">{p.nights}</td>
                        <td className="py-2 pr-3 text-right tabular-nums">{money(p.revenue, currency)}</td>
                        <td className="py-2 text-right tabular-nums">{p.cancelled}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </HmsCard>
        </>
      ) : null}
    </div>
  );
}

function InboxRow({ item, slug, busy, onRetry, onDone }: { item: InboxItem; slug: string; busy: boolean; onRetry: () => void; onDone: () => void }) {
  const kind = item.kind === "new" ? "New booking" : item.kind === "modified" ? "Change" : "Cancellation";
  const tone = item.status === "applied" ? "green" : item.status === "needs_attention" ? "amber" : item.status === "received" ? "blue" : "slate";
  const label = item.status === "applied" ? "Done" : item.status === "needs_attention" ? "Needs you" : item.status === "received" ? "Placing…" : "Closed";
  return (
    <li className="py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span>
          <span className="font-medium">{item.channelName}</span> · {kind}
          {item.guest ? ` · ${item.guest}` : ""}
          {item.arrival && item.departure ? ` · ${item.arrival} to ${item.departure}` : ""}
          <span className="block text-xs text-slate-500">{when(item.createdAt)}</span>
        </span>
        <HmsPill tone={tone}>{label}</HmsPill>
      </div>
      {item.message ? <p className={`mt-1 ${item.status === "needs_attention" ? "text-amber-900" : "text-slate-600"}`}>{item.message}</p> : null}
      <div className="mt-2 flex flex-wrap gap-2">
        {item.reservationIds.slice(0, 3).map((id) => (
          <Link key={id} href={`/hms/${slug}/reservations/${id}`} className={hmsButton.quiet}>
            Open booking
          </Link>
        ))}
        {item.status === "needs_attention" || item.status === "received" ? (
          <>
            <button type="button" className={hmsButton.small} disabled={busy} onClick={onRetry}>
              Try again
            </button>
            <button type="button" className={hmsButton.small} disabled={busy} onClick={onDone}>
              Done, I handled it
            </button>
          </>
        ) : null}
      </div>
    </li>
  );
}

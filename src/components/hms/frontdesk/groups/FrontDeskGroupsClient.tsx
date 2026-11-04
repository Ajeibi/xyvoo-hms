"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, RefreshCw, Users } from "lucide-react";
import {
  HmsAlert,
  HmsCard,
  HmsEmptyState,
  HmsField,
  HmsPage,
  HmsPageHeader,
  HmsPill,
  hmsButton,
  hmsInput,
} from "@/components/hms/hms-ui";
import { toastError, toastSuccess } from "@/lib/app-toast";
import { formatPricingAmount } from "@/lib/hms/room-pricing";
import {
  GROUP_PAYMENT_METHODS,
  type GroupCandidate,
  type GroupPaymentMethod,
  type GroupSummary,
} from "@/lib/hms/frontdesk-groups-shared";

function day(iso: string | null) {
  return iso ? new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", timeZone: "UTC" }) : "—";
}

const STATUS_TONE: Record<string, "green" | "blue" | "slate"> = { checked_in: "green", confirmed: "blue" };
const STATUS_LABEL: Record<string, string> = { checked_in: "In the house", confirmed: "Waiting", checked_out: "Left", cancelled: "Cancelled" };

async function send(url: string, method: string, body?: unknown) {
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, json };
}

export function FrontDeskGroupsClient({ slug }: { slug: string }) {
  const [groups, setGroups] = useState<GroupSummary[]>([]);
  const [candidates, setCandidates] = useState<GroupCandidate[]>([]);
  const [currency, setCurrency] = useState("NGN");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/hotel/frontdesk/groups?slug=${encodeURIComponent(slug)}`, { cache: "no-store" });
      const json = await res.json();
      setGroups(json.groups ?? []);
      setCandidates(json.candidates ?? []);
      setCurrency(json.currency ?? "NGN");
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <HmsPage wide>
      <HmsPageHeader
        eyebrow="Front desk"
        meaning="guests"
        title="Group check-in"
        description="Put rooms booked together into a group, check them all in at once, and see one bill for the whole group."
        actions={
          <button type="button" className={hmsButton.secondary} onClick={() => void load()}>
            <RefreshCw className="h-4 w-4" aria-hidden />
            Refresh
          </button>
        }
      />

      <NewGroupCard slug={slug} loading={loading} candidates={candidates} currency={currency} onCreated={load} />

      {loading ? (
        <p className="flex items-center gap-2 text-sm text-slate-600">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          Loading groups…
        </p>
      ) : groups.length === 0 ? (
        <HmsEmptyState
          art="bell"
          meaning="guests"
          title="No groups yet"
          description="Choose two or more bookings above to make the first group."
        />
      ) : (
        groups.map((g) => <GroupCard key={g.id} slug={slug} group={g} currency={currency} onChanged={load} />)
      )}
    </HmsPage>
  );
}

function NewGroupCard({
  slug,
  loading,
  candidates,
  currency,
  onCreated,
}: {
  slug: string;
  loading: boolean;
  candidates: GroupCandidate[];
  currency: string;
  onCreated: () => Promise<void>;
}) {
  const [picked, setPicked] = useState<string[]>([]);
  const [name, setName] = useState("");
  const [coordinator, setCoordinator] = useState("");
  const [phone, setPhone] = useState("");
  const [shared, setShared] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  async function create() {
    setBusy(true);
    setError(null);
    const { ok, json } = await send("/api/hotel/frontdesk/groups", "POST", {
      slug,
      name,
      coordinatorName: coordinator || undefined,
      coordinatorPhone: phone || undefined,
      sharedBilling: shared,
      reservationIds: picked,
    });
    setBusy(false);
    if (!ok) {
      setError(json.error ?? "Could not create the group.");
      toastError("Group not created", json.error ?? "Try again.");
      return;
    }
    toastSuccess("Group created");
    setPicked([]);
    setName("");
    setCoordinator("");
    setPhone("");
    await onCreated();
  }

  return (
    <HmsCard
      id="new-group"
      icon={Users}
      meaning="guests"
      title="Make a group"
      description={`Bookings still to arrive (${currency}). Tick the rooms that belong together.`}
    >
      {loading ? null : candidates.length === 0 ? (
        <p className="text-sm text-slate-600">No waiting bookings are free to group in the next 45 days.</p>
      ) : (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void create();
          }}
        >
          <ul className="max-h-64 divide-y divide-slate-100 overflow-y-auto rounded-xl border border-slate-200">
            {candidates.map((c) => (
              <li key={c.reservationId}>
                <label className="flex min-h-11 cursor-pointer items-center gap-3 px-3 py-2 text-sm text-slate-800">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-blue-700"
                    checked={picked.includes(c.reservationId)}
                    onChange={() => toggle(c.reservationId)}
                  />
                  <span className="font-medium">{c.guestName}</span>
                  <span className="text-slate-600">
                    {c.confirmationCode} · {day(c.arrivalAt)} to {day(c.departureAt)}
                  </span>
                  <span className="ml-auto text-slate-600">{c.roomCode ? `Room ${c.roomCode}` : "No room yet"}</span>
                </label>
              </li>
            ))}
          </ul>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <HmsField id="group-name" label="Group name">
              <input id="group-name" className={hmsInput} maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
            </HmsField>
            <HmsField id="group-coordinator" label="Who is in charge" hint="Optional.">
              <input
                id="group-coordinator"
                aria-describedby="group-coordinator-hint"
                className={hmsInput}
                maxLength={80}
                value={coordinator}
                onChange={(e) => setCoordinator(e.target.value)}
              />
            </HmsField>
            <HmsField id="group-phone" label="Their phone" hint="Optional.">
              <input
                id="group-phone"
                aria-describedby="group-phone-hint"
                className={hmsInput}
                maxLength={30}
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </HmsField>
          </div>

          <label className="flex items-center gap-3 text-sm text-slate-800">
            <input type="checkbox" className="h-4 w-4 accent-blue-700" checked={shared} onChange={(e) => setShared(e.target.checked)} />
            One bill for the whole group (take one payment for all rooms)
          </label>

          {error ? <HmsAlert message={error} /> : null}
          <button type="submit" className={hmsButton.primary} disabled={busy || picked.length < 2 || !name.trim()}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
            Make group of {picked.length} room{picked.length === 1 ? "" : "s"}
          </button>
        </form>
      )}
    </HmsCard>
  );
}

function GroupCard({
  slug,
  group,
  currency,
  onChanged,
}: {
  slug: string;
  group: GroupSummary;
  currency: string;
  onChanged: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<GroupPaymentMethod>("cash");
  const money = (n: number) => formatPricingAmount(n, currency);
  const base = `/api/hotel/frontdesk/groups/${group.id}`;
  const readyCount = group.members.filter((m) => m.status === "confirmed" && m.roomUnitId).length;
  const canPay = group.sharedBilling && group.totals.balance > 0 && group.counts.inHouse > 0;

  async function checkInAll() {
    setBusy(true);
    setError(null);
    const { ok, json } = await send(`${base}/check-in`, "POST", { slug });
    setBusy(false);
    if (!ok) {
      setError(json.error ?? "Group check-in failed.");
      toastError("Group not checked in", json.error ?? "Try again.");
      return;
    }
    const failed = (json.failed ?? []) as { confirmationCode: string; error: string }[];
    if (failed.length > 0) {
      const msg = failed.map((f) => `${f.confirmationCode}: ${f.error}`).join(" ");
      setError(`${json.checkedIn} checked in. ${msg}`);
      toastError(`${json.checkedIn} checked in, ${failed.length} not`, msg);
    } else {
      toastSuccess(`${json.checkedIn} room${json.checkedIn === 1 ? "" : "s"} checked in`);
    }
    await onChanged();
  }

  async function pay() {
    setBusy(true);
    setError(null);
    const { ok, json } = await send(`${base}/payment`, "POST", { slug, amount: Number(amount), method });
    setBusy(false);
    if (!ok) {
      setError(json.error ?? "Could not record the payment.");
      toastError("Payment not recorded", json.error ?? "Try again.");
      return;
    }
    toastSuccess(`Payment spread over ${json.rooms} room${json.rooms === 1 ? "" : "s"}`);
    setAmount("");
    await onChanged();
  }

  async function breakUp() {
    if (!window.confirm(`Break up "${group.name}"? The bookings stay; they just stop being a group.`)) return;
    const { ok, json } = await send(`${base}?slug=${encodeURIComponent(slug)}`, "DELETE");
    if (!ok) {
      toastError("Could not break up the group", json.error ?? "Try again.");
      return;
    }
    await onChanged();
  }

  return (
    <HmsCard
      id={`group-${group.id}`}
      icon={Users}
      meaning="guests"
      title={group.name}
      description={`${group.counts.rooms} rooms · ${day(group.arrivalAt)} to ${day(group.departureAt)}${group.coordinatorName ? ` · ${group.coordinatorName}` : ""}${group.coordinatorPhone ? ` (${group.coordinatorPhone})` : ""}`}
      flush
    >
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">Rooms in {group.name}</caption>
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-sm font-semibold text-slate-700">
              <th scope="col" className="py-3 pl-6 pr-4">Room</th>
              <th scope="col" className="py-3 pr-4">Guest</th>
              <th scope="col" className="py-3 pr-4">Status</th>
              <th scope="col" className="py-3 pr-4 text-right">Charges</th>
              <th scope="col" className="py-3 pr-4 text-right">Paid</th>
              <th scope="col" className="py-3 pr-6 text-right">Owes</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {group.members.map((m) => (
              <tr key={m.reservationId}>
                <td className="py-3 pl-6 pr-4 text-slate-800">{m.roomCode ? `Room ${m.roomCode}` : <span className="text-amber-800">No room yet</span>}</td>
                <td className="py-3 pr-4">
                  <span className="font-medium text-slate-900">{m.guestName}</span>
                  <span className="block text-xs text-slate-600">{m.confirmationCode}</span>
                </td>
                <td className="py-3 pr-4">
                  <HmsPill tone={STATUS_TONE[m.status] ?? "slate"}>{STATUS_LABEL[m.status] ?? m.status}</HmsPill>
                </td>
                <td className="py-3 pr-4 text-right tabular-nums">{money(m.charges)}</td>
                <td className="py-3 pr-4 text-right tabular-nums">{money(m.paid)}</td>
                <td className="py-3 pr-6 text-right font-semibold tabular-nums">{money(m.balance)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-slate-200 bg-slate-50 font-semibold text-slate-900">
              <td className="py-3 pl-6 pr-4" colSpan={3}>Master bill</td>
              <td className="py-3 pr-4 text-right tabular-nums">{money(group.totals.charges)}</td>
              <td className="py-3 pr-4 text-right tabular-nums">{money(group.totals.paid)}</td>
              <td className="py-3 pr-6 text-right tabular-nums">{money(group.totals.balance)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="space-y-4 border-t border-slate-100 p-6">
        {group.counts.needRoom > 0 ? (
          <p className="text-sm text-amber-800">
            {group.counts.needRoom} room{group.counts.needRoom === 1 ? " has" : "s have"} no room number yet. Give them one from Arrivals before checking in.
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-3">
          <button type="button" className={hmsButton.primary} disabled={busy || readyCount === 0} onClick={() => void checkInAll()}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
            Check in {readyCount} waiting room{readyCount === 1 ? "" : "s"}
          </button>
          <button type="button" className={hmsButton.secondary} onClick={() => void breakUp()}>
            Break up group
          </button>
        </div>

        {canPay ? (
          <form
            className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-end"
            onSubmit={(e) => {
              e.preventDefault();
              void pay();
            }}
          >
            <HmsField id={`pay-${group.id}`} label="Take one payment for the group" hint={`Up to ${money(group.totals.balance)}. It is spread over the rooms.`}>
              <input
                id={`pay-${group.id}`}
                aria-describedby={`pay-${group.id}-hint`}
                type="number"
                min="0"
                step="0.01"
                className={hmsInput}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </HmsField>
            <HmsField id={`method-${group.id}`} label="Paid by">
              <select id={`method-${group.id}`} className={hmsInput} value={method} onChange={(e) => setMethod(e.target.value as GroupPaymentMethod)}>
                {GROUP_PAYMENT_METHODS.map((m) => (
                  <option key={m} value={m}>
                    {m === "cash" ? "Cash" : "Card machine"}
                  </option>
                ))}
              </select>
            </HmsField>
            <button type="submit" className={hmsButton.primary} disabled={busy || !(Number(amount) > 0)}>
              Record payment
            </button>
          </form>
        ) : null}

        {error ? <HmsAlert message={error} /> : null}
      </div>
    </HmsCard>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Link2, Search, UserCheck } from "lucide-react";
import { HmsAlert, HmsCard, HmsEmptyState, HmsPill, hmsButton, hmsInput } from "@/components/hms/hms-ui";
import type { GroupGuestProfileView, GuestSuggestionView } from "@/lib/hms/groups/group-guests";

const money = (n: number, currency: string) => new Intl.NumberFormat("en-NG", { style: "currency", currency, maximumFractionDigits: 0 }).format(n);
const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-NG", { dateStyle: "medium" }) : "—");

export function GroupGuestsClient({
  groupSlug,
  profiles,
  suggestions,
  search,
  currency,
}: {
  groupSlug: string;
  profiles: GroupGuestProfileView[];
  suggestions: GuestSuggestionView[];
  search: string;
  currency: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function act(body: Record<string, unknown>, done: string) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const res = await fetch(`/api/hotel/groups/${groupSlug}/guests`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "That didn't work.");
      setNotice(body.action === "match" ? `Matching done: ${json.linked ?? 0} records linked, ${json.suggestions ?? 0} possible matches.` : done);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't work.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div aria-live="polite" className="space-y-2">
        <HmsAlert message={error} />
        {notice ? <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">{notice}</p> : null}
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <form method="get" className="flex flex-1 flex-wrap items-end gap-2" role="search">
          <label htmlFor="guest-search" className="sr-only">
            Search guests by name or email
          </label>
          <input id="guest-search" name="q" defaultValue={search} placeholder="Search by name or email" className={`${hmsInput} max-w-md`} />
          <button type="submit" className={hmsButton.secondary}>
            <Search className="h-4 w-4" aria-hidden /> Search
          </button>
        </form>
        <button type="button" disabled={busy} className={hmsButton.primary} onClick={() => void act({ action: "match" }, "")}>
          <Link2 className="h-4 w-4" aria-hidden /> Match guests now
        </button>
      </div>

      {suggestions.length ? (
        <HmsCard id="suggestions" title="Possible matches to check" icon={UserCheck} meaning="guests" description="Same name and phone at different hotels, but no matching email. Link them only if you're sure they're one person.">
          <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
            {suggestions.map((s) => (
              <li key={s.matchKey} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
                <span className="min-w-64 flex-1">
                  {s.guests.map((g) => `${g.guestName} at ${g.hotelName}`).join(" · ")}
                  <span className="block text-xs text-slate-500">{s.reason}</span>
                </span>
                <button type="button" disabled={busy} className={hmsButton.small} onClick={() => void act({ action: "confirm", matchKey: s.matchKey }, "Linked.")}>
                  Same person
                </button>
                <button type="button" disabled={busy} className={hmsButton.danger} onClick={() => void act({ action: "dismiss", matchKey: s.matchKey }, "Dismissed.")}>
                  Not the same
                </button>
              </li>
            ))}
          </ul>
        </HmsCard>
      ) : null}

      {profiles.length === 0 ? (
        <HmsEmptyState icon={Link2} title={search ? "No linked guests match that search" : "No guests known at more than one hotel yet"} description="Guests are linked when the same email (or phone, if switched on) is used at two or more of your hotels. Matching also runs every night." />
      ) : (
        <ul className="space-y-3">
          {profiles.map((p) => (
            <li key={p.profileId} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-heading text-base font-semibold text-slate-900">{p.displayName}</p>
                {p.vip ? <HmsPill tone="amber">VIP</HmsPill> : null}
                <span className="text-sm text-slate-600">
                  {p.totalStays} stays · {p.totalNights} nights · {money(p.totalSpend, currency)} · last stay {day(p.lastStayAt)}
                </span>
              </div>
              <ul className="mt-3 divide-y divide-slate-100 rounded-xl bg-slate-50">
                {p.links.map((l) => (
                  <li key={l.linkId} className="flex flex-wrap items-center gap-3 px-3 py-2 text-sm">
                    <span className="min-w-48 flex-1">
                      <span className="font-medium text-slate-900">{l.hotelName}</span> · {l.guestName}
                      <span className="block text-xs text-slate-500">
                        {l.stays} stays · {l.nights} nights · {money(l.spend, currency)} · linked by {l.method === "manual" ? "a person" : l.method}
                        {l.preferences ? ` · prefers: ${l.preferences}` : ""}
                        {l.accessibility.length ? ` · needs: ${l.accessibility.join(", ")}` : ""}
                      </span>
                    </span>
                    <button
                      type="button"
                      disabled={busy}
                      className={hmsButton.danger}
                      onClick={() => window.confirm(`Unlink ${l.guestName} at ${l.hotelName}? They won't be matched automatically again.`) && void act({ action: "unlink", linkId: l.linkId }, "Unlinked.")}
                    >
                      Unlink
                    </button>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

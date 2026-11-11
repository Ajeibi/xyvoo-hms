"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Building2, History, Share2, Users } from "lucide-react";
import { HmsAlert, HmsCard, HmsField, HmsPill, hmsButton, hmsInput } from "@/components/hms/hms-ui";
import type { GroupAuditRow, GroupInviteRow, GroupMemberRow } from "@/lib/hms/groups/group-admin";
import { GROUP_AUDIT_LABELS, GROUP_ROLE_HELP, GROUP_ROLE_LABELS, GROUP_ROLES, type GroupHotel, type GroupRole, type GroupSharing } from "@/lib/hms/groups/group-types";

type Props = {
  groupSlug: string;
  groupName: string;
  isOwner: boolean;
  currentUserId: string;
  hotels: GroupHotel[];
  invites: GroupInviteRow[];
  members: GroupMemberRow[];
  sharing: GroupSharing;
  audit: GroupAuditRow[];
};

async function send(url: string, method: string, body?: unknown) {
  const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || "That didn't work.");
  return json;
}

const when = (iso: string) => new Date(iso).toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short" });

export function GroupSettingsClient(p: Props) {
  const router = useRouter();
  const base = `/api/hotel/groups/${p.groupSlug}`;
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState(p.groupName);
  const [hotelSlug, setHotelSlug] = useState("");
  const [inviteNote, setInviteNote] = useState("");
  const [inviteLink, setInviteLink] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<GroupRole>("group_viewer");
  const [share, setShare] = useState(p.sharing);

  async function run(work: () => Promise<unknown>, done?: string) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await work();
      if (done) setNotice(done);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't work.");
    } finally {
      setBusy(false);
    }
  }

  const openInvites = p.invites.filter((i) => i.open);

  return (
    <div className="space-y-6">
      <div aria-live="polite" className="space-y-2">
        <HmsAlert message={error} />
        {notice ? <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">{notice}</p> : null}
      </div>

      {p.isOwner ? (
        <HmsCard id="group-name" title="Group name">
          <form
            className="flex flex-wrap items-end gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              void run(() => send(`${base}/settings`, "PATCH", { name }), "Name saved.");
            }}
          >
            <div className="min-w-64 flex-1">
              <HmsField id="group-name-input" label="Name">
                <input id="group-name-input" className={hmsInput} value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
              </HmsField>
            </div>
            <button type="submit" disabled={busy || name.trim() === p.groupName} className={hmsButton.primary}>
              Save name
            </button>
          </form>
        </HmsCard>
      ) : null}

      <HmsCard id="hotels" title="Hotels in the group" icon={Building2} meaning="rooms" description="A hotel joins only when its owner accepts an invitation. Taking a hotel out cuts off the group's view of it at once.">
        <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
          {p.hotels.map((h) => (
            <li key={h.tenantId} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
              <span>
                <span className="font-medium text-slate-900">{h.name}</span> <span className="text-slate-500">/hms/{h.slug}</span>
                <span className="block text-xs text-slate-500">In the group since {when(h.joinedAt)}</span>
              </span>
              {p.isOwner && p.hotels.length > 1 ? (
                <button
                  type="button"
                  disabled={busy}
                  className={hmsButton.danger}
                  onClick={() => {
                    if (window.confirm(`Take ${h.name} out of the group? The group will stop seeing its figures, and shared guest links with it are removed.`)) {
                      void run(() => send(`${base}/hotels?tenantId=${h.tenantId}`, "DELETE"), `${h.name} has left the group.`);
                    }
                  }}
                >
                  Take out of group
                </button>
              ) : null}
            </li>
          ))}
        </ul>

        {p.isOwner ? (
          <div className="mt-5 space-y-3">
            <h3 className="text-sm font-semibold text-slate-900">Invite a hotel</h3>
            <form
              className="flex flex-wrap items-end gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                void run(async () => {
                  const res = (await send(`${base}/invites`, "POST", { hotelSlug, note: inviteNote || null })) as { link: string; hotelName: string; emailed: number };
                  setInviteLink(res.link);
                  setHotelSlug("");
                  setInviteNote("");
                  setNotice(res.emailed ? `Invitation emailed to ${res.hotelName}'s owner.` : `Invitation made for ${res.hotelName}. Send them the link below.`);
                });
              }}
            >
              <div className="min-w-56 flex-1">
                <HmsField id="invite-slug" label="The hotel's web address name" hint="The part after /hms/ in their address, for example firefly">
                  <input id="invite-slug" className={hmsInput} value={hotelSlug} onChange={(e) => setHotelSlug(e.target.value)} required />
                </HmsField>
              </div>
              <div className="min-w-56 flex-1">
                <HmsField id="invite-note" label="Note to the owner" optional>
                  <input id="invite-note" className={hmsInput} value={inviteNote} onChange={(e) => setInviteNote(e.target.value)} maxLength={500} />
                </HmsField>
              </div>
              <button type="submit" disabled={busy || !hotelSlug.trim()} className={hmsButton.primary}>
                Send invitation
              </button>
            </form>
            {inviteLink ? (
              <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm">
                <p className="font-medium text-blue-900">Invitation link (works for 14 days, only for that hotel&apos;s owner):</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <input readOnly value={inviteLink} aria-label="Invitation link" className={`${hmsInput} flex-1`} onFocus={(e) => e.currentTarget.select()} />
                  <button type="button" className={hmsButton.small} onClick={() => void navigator.clipboard?.writeText(inviteLink).then(() => setNotice("Link copied."))}>
                    Copy
                  </button>
                </div>
              </div>
            ) : null}
            {openInvites.length ? (
              <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
                {openInvites.map((i) => (
                  <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 text-sm">
                    <span>
                      Waiting for <span className="font-medium">{i.hotelName}</span> · expires {when(i.expiresAt)}
                    </span>
                    <button type="button" disabled={busy} className={hmsButton.danger} onClick={() => void run(() => send(`${base}/invites?id=${i.id}`, "DELETE"), "Invitation cancelled.")}>
                      Cancel
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </HmsCard>

      <HmsCard id="sharing" title="What hotels share" icon={Share2} meaning="guests" description="Off by default. Hotels can read each other's data only in the areas switched on here, and never change it.">
        <fieldset disabled={!p.isOwner || busy} className="space-y-3">
          <legend className="sr-only">Sharing between hotels</legend>
          {(
            [
              ["shareGuests", "Guest profiles", "Staff see a guest's stays, VIP status, preferences and access needs from your other hotels. Never IDs, contact details, notes or bills."],
              ["shareLoyalty", "Loyalty points", "One points balance across the group; points earned at one hotel can be spent at another. Needs guest profiles."],
              ["shareRates", "Rate plans", "Staff can see the other hotels' rate plans and prices (read only)."],
              ["matchByPhone", "Match guests by phone too", "Link guests with the same phone number even when their emails differ. Off: those are suggested for someone to confirm."],
            ] as const
          ).map(([key, label, help]) => (
            <label key={key} className="flex items-start gap-3 rounded-xl border border-slate-200 p-3">
              <input
                type="checkbox"
                className="mt-1 h-4 w-4"
                checked={share[key]}
                disabled={key === "shareLoyalty" && !share.shareGuests}
                onChange={(e) => setShare((s) => ({ ...s, [key]: e.target.checked, ...(key === "shareGuests" && !e.target.checked ? { shareLoyalty: false } : {}) }))}
              />
              <span>
                <span className="block text-sm font-medium text-slate-900">{label}</span>
                <span className="block text-sm text-slate-600">{help}</span>
              </span>
            </label>
          ))}
        </fieldset>
        {p.isOwner ? (
          <button
            type="button"
            disabled={busy}
            className={`${hmsButton.primary} mt-4`}
            onClick={() =>
              void run(async () => {
                const res = (await send(`${base}/sharing`, "PUT", {
                  shareGuests: share.shareGuests,
                  shareLoyalty: share.shareLoyalty,
                  shareRates: share.shareRates,
                  matchByPhone: share.matchByPhone,
                })) as { matching?: { linked: number; suggestions: number } | null };
                setNotice(res.matching ? `Sharing saved. ${res.matching.linked} guest records linked, ${res.matching.suggestions} possible matches to check.` : "Sharing saved.");
              })
            }
          >
            Save sharing
          </button>
        ) : (
          <p className="mt-3 text-sm text-slate-600">Only the group owner can change this.</p>
        )}
      </HmsCard>

      <HmsCard id="people" title="People who run the group" icon={Users} meaning="team" description="A group role shows the group screens. To work inside a hotel, a person also needs that hotel's own login.">
        <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
          {p.members.map((m) => (
            <li key={m.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
              <span className="min-w-48 flex-1">
                <span className="block font-medium text-slate-900">{m.name || m.email}</span>
                {m.name ? <span className="block text-xs text-slate-500">{m.email}</span> : null}
              </span>
              {p.isOwner ? (
                <>
                  <label className="sr-only" htmlFor={`role-${m.id}`}>
                    Role for {m.name || m.email}
                  </label>
                  <select id={`role-${m.id}`} className={`${hmsInput} w-auto`} defaultValue={m.role} disabled={busy} onChange={(e) => void run(() => send(`${base}/members`, "PATCH", { id: m.id, role: e.target.value }), "Role changed.")}>
                    {GROUP_ROLES.map((r) => (
                      <option key={r} value={r}>
                        {GROUP_ROLE_LABELS[r]}
                      </option>
                    ))}
                  </select>
                  <label className="flex items-center gap-2 text-sm text-slate-700">
                    <input type="checkbox" defaultChecked={m.receivesReports} disabled={busy} onChange={(e) => void run(() => send(`${base}/members`, "PATCH", { id: m.id, receivesReports: e.target.checked }), "Saved.")} />
                    Daily report email
                  </label>
                  {m.userId !== p.currentUserId ? (
                    <button type="button" disabled={busy} className={hmsButton.danger} onClick={() => window.confirm(`Remove ${m.name || m.email} from the group?`) && void run(() => send(`${base}/members?id=${m.id}`, "DELETE"), "Removed.")}>
                      Remove
                    </button>
                  ) : null}
                </>
              ) : (
                <HmsPill tone="blue">{GROUP_ROLE_LABELS[m.role]}</HmsPill>
              )}
            </li>
          ))}
        </ul>
        {p.isOwner ? (
          <form
            className="mt-4 flex flex-wrap items-end gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                await send(`${base}/members`, "POST", { email, role });
                setEmail("");
              }, "Added.");
            }}
          >
            <div className="min-w-56 flex-1">
              <HmsField id="member-email" label="Email of their XYVOO login">
                <input id="member-email" type="email" className={hmsInput} value={email} onChange={(e) => setEmail(e.target.value)} required />
              </HmsField>
            </div>
            <div>
              <HmsField id="member-role" label="Role">
                <select id="member-role" className={hmsInput} value={role} onChange={(e) => setRole(e.target.value as GroupRole)}>
                  {GROUP_ROLES.map((r) => (
                    <option key={r} value={r}>
                      {GROUP_ROLE_LABELS[r]}
                    </option>
                  ))}
                </select>
              </HmsField>
            </div>
            <button type="submit" disabled={busy || !email} className={hmsButton.primary}>
              Add person
            </button>
            <p className="w-full text-xs text-slate-600">{GROUP_ROLE_HELP[role]}</p>
          </form>
        ) : null}
      </HmsCard>

      <HmsCard id="activity" title="Activity" icon={History} description="Every change to the group, newest first." flush>
        {p.audit.length ? (
          <ul className="divide-y divide-slate-100">
            {p.audit.map((a) => (
              <li key={a.id} className="px-4 py-2 text-sm sm:px-6">
                <span className="font-medium text-slate-900">{GROUP_AUDIT_LABELS[a.action] ?? a.action}</span>
                {a.hotelName ? <span className="text-slate-700"> · {a.hotelName}</span> : null}
                <span className="block text-xs text-slate-500">
                  {when(a.createdAt)}
                  {a.actor ? ` · ${a.actor}` : " · system"}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-6 py-4 text-sm text-slate-600">Nothing yet.</p>
        )}
      </HmsCard>
    </div>
  );
}

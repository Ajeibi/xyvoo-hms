"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Mail, UserPlus, Users } from "lucide-react";
import { DashAlert, dashButton, DashCard, DashEmptyState, DashField, dashInput, DashPill, DashStatus, sendJson } from "./dashboard-ui";

type Role = "owner" | "admin" | "staff";
type Member = { userId: string; role: Role; name: string; email: string; joinedAt: string };
type Invite = { id: string; name: string; email: string; role: "admin" | "staff"; state: "open" | "expired"; expiresAt: string; createdAt: string };
type Team = { you: { userId: string; role: Role }; canInvite: boolean; members: Member[]; invites: Invite[] };

const ROLE_LABELS: Record<Role, string> = { owner: "Owner", admin: "Admin", staff: "Staff" };
const ROLE_HELP: Record<"admin" | "staff", string> = {
  admin: "Admin: everything, including payments, settings and the team, except changing or removing the owner.",
  staff: "Staff: orders, products, collections and customers. No payments, settings or team.",
};
const ring = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-xyvoo-blue";
const date = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

/** Team: members with their roles, open invitations, and the invite form. */
export default function TeamManager({ slug }: { slug: string }) {
  const [team, setTeam] = useState<Team | null>(null);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", email: "", role: "staff" as "admin" | "staff" });
  const [formError, setFormError] = useState<{ message: string; field?: string }>({ message: "" });
  const nameInput = useRef<HTMLInputElement>(null);

  const load = useCallback(() => {
    fetch(`/api/store/team?slug=${encodeURIComponent(slug)}`)
      .then(async (r) => {
        const data = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(typeof data.error === "string" ? data.error : "We couldn't load your team. Please refresh the page.");
        setTeam(data);
      })
      .catch((e) => setError((e as Error).message));
  }, [slug]);

  useEffect(load, [load]);

  const run = async (key: string, action: () => Promise<unknown>, done: string) => {
    setBusy(key);
    setError("");
    setStatus("");
    try {
      await action();
      setStatus(done);
      setConfirmRemove(null);
      load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const invite = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy("invite");
    setFormError({ message: "" });
    setStatus("");
    try {
      await sendJson("/api/store/team/invites", "POST", { slug, ...form });
      setStatus(`Invitation sent to ${form.email}. It lasts 7 days.`);
      setForm({ name: "", email: "", role: "staff" });
      load();
      nameInput.current?.focus();
    } catch (err) {
      const message = (err as Error).message;
      setFormError({ message, field: /email/i.test(message) ? "email" : /name/i.test(message) ? "name" : undefined });
    } finally {
      setBusy(null);
    }
  };

  if (!team) {
    return error ? <DashAlert message={error} /> : <div aria-hidden className="h-40 animate-pulse rounded-2xl bg-slate-100 motion-reduce:animate-none" />;
  }

  const youAreOwner = team.you.role === "owner";
  const canChange = (m: Member) => m.role !== "owner" || youAreOwner;

  return (
    <div className="space-y-6">
      <div aria-live="polite">{status ? <DashStatus message={status} /> : null}</div>
      <DashAlert message={error} />

      <DashCard id="members" icon={Users} title="People on the team" description="Removing someone ends their access straight away.">
        <ul className="divide-y divide-slate-100">
          {team.members.map((m) => {
            const you = m.userId === team.you.userId;
            const label = `${m.name}${you ? " (you)" : ""}`;
            return (
              <li key={m.userId} className="flex flex-wrap items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-900">{label}</p>
                  <p className="truncate text-sm text-slate-600">{m.email}</p>
                  <p className="text-xs text-slate-500">Joined {date(m.joinedAt)}</p>
                </div>
                {m.role === "owner" || !team.canInvite || !canChange(m) ? (
                  <DashPill tone={m.role === "owner" ? "blue" : "slate"}>{ROLE_LABELS[m.role]}</DashPill>
                ) : (
                  <div>
                    <label htmlFor={`role-${m.userId}`} className="sr-only">
                      Role for {m.name}
                    </label>
                    <select
                      id={`role-${m.userId}`}
                      value={m.role}
                      disabled={busy !== null}
                      onChange={(e) =>
                        run(
                          `role-${m.userId}`,
                          () => sendJson(`/api/store/team/members/${m.userId}`, "PATCH", { slug, role: e.target.value }),
                          `${m.name} is now ${e.target.value === "admin" ? "an Admin" : "Staff"}.`,
                        )
                      }
                      className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-xyvoo-blue"
                    >
                      <option value="admin">Admin</option>
                      <option value="staff">Staff</option>
                    </select>
                  </div>
                )}
                {canChange(m) && m.role !== "owner" ? (
                  confirmRemove === m.userId ? (
                    <div role="group" aria-label={`Remove ${m.name}?`} className="flex w-full flex-wrap items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-900 sm:w-auto">
                      <span>{you ? "Leave this shop's team?" : `Remove ${m.name}? They lose access at once.`}</span>
                      <button
                        type="button"
                        disabled={busy !== null}
                        onClick={() =>
                          run(
                            `remove-${m.userId}`,
                            async () => {
                              await sendJson(`/api/store/team/members/${m.userId}?slug=${encodeURIComponent(slug)}`, "DELETE");
                              if (you) window.location.assign("/auth/login/storefront");
                            },
                            `${m.name} has been removed from the team.`,
                          )
                        }
                        className={`rounded-lg bg-red-700 px-3 py-1.5 font-semibold text-white hover:bg-red-800 disabled:opacity-60 ${ring}`}
                      >
                        {busy === `remove-${m.userId}` ? "Removing…" : "Yes, remove"}
                      </button>
                      <button type="button" onClick={() => setConfirmRemove(null)} className={`${dashButton.quiet} ${ring}`}>
                        Keep
                      </button>
                    </div>
                  ) : (
                    <button type="button" onClick={() => setConfirmRemove(m.userId)} className={`${dashButton.danger} ${ring}`}>
                      {you ? "Leave team" : "Remove"}
                      <span className="sr-only"> {m.name}</span>
                    </button>
                  )
                ) : null}
              </li>
            );
          })}
        </ul>
      </DashCard>

      {team.canInvite ? (
        <DashCard id="invite" icon={UserPlus} title="Invite someone" description="They'll get an email with a link. To accept, they sign in or create an account, then enter a code we email them.">
          <form onSubmit={invite} className="grid gap-4 sm:grid-cols-2" noValidate>
            <DashField id="invite-name" label="Their name">
              <input
                ref={nameInput}
                id="invite-name"
                className={dashInput}
                value={form.name}
                autoComplete="off"
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                aria-invalid={formError.field === "name" || undefined}
              />
            </DashField>
            <DashField id="invite-email" label="Their email address">
              <input
                id="invite-email"
                type="email"
                className={dashInput}
                value={form.email}
                autoComplete="off"
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                aria-invalid={formError.field === "email" || undefined}
              />
            </DashField>
            <fieldset className="sm:col-span-2">
              <legend className="mb-2 text-sm font-medium text-slate-800">Role</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {(["staff", "admin"] as const).map((role) => (
                  <label
                    key={role}
                    className={`flex cursor-pointer gap-3 rounded-xl border p-3 text-sm ${form.role === role ? "border-xyvoo-blue bg-blue-50/50" : "border-slate-200"}`}
                  >
                    <input type="radio" name="invite-role" value={role} checked={form.role === role} onChange={() => setForm({ ...form, role })} className="mt-0.5 accent-xyvoo-blue" />
                    <span className="text-slate-700">{ROLE_HELP[role]}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            {formError.message ? (
              <div className="sm:col-span-2">
                <DashAlert message={formError.message} />
              </div>
            ) : null}
            <div className="sm:col-span-2">
              <button type="submit" disabled={busy !== null || !form.name.trim() || !form.email.trim()} className={`${dashButton.primary} ${ring}`}>
                <Mail className="h-4 w-4" aria-hidden />
                {busy === "invite" ? "Sending…" : "Send invitation"}
              </button>
            </div>
          </form>
        </DashCard>
      ) : null}

      <DashCard id="invites" icon={Mail} title="Invitations waiting" description="Invitations last 7 days. Sending one again gives a fresh link and the old one stops working.">
        {team.invites.length ? (
          <ul className="divide-y divide-slate-100">
            {team.invites.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-900">
                    {i.name} <span className="font-normal text-slate-600">· {ROLE_LABELS[i.role]}</span>
                  </p>
                  <p className="truncate text-sm text-slate-600">{i.email}</p>
                  <p className="text-xs text-slate-500">{i.state === "expired" ? "Expired" : `Expires ${date(i.expiresAt)}`}</p>
                </div>
                {i.state === "expired" ? <DashPill tone="amber">Expired</DashPill> : <DashPill tone="blue">Waiting</DashPill>}
                {team.canInvite ? (
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => run(`resend-${i.id}`, () => sendJson(`/api/store/team/invites/${i.id}`, "POST", { slug }), `Invitation sent to ${i.email} again.`)}
                    className={`${dashButton.quiet} ${ring}`}
                  >
                    {busy === `resend-${i.id}` ? "Sending…" : "Send again"}
                    <span className="sr-only"> to {i.name}</span>
                  </button>
                ) : null}
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => run(`cancel-${i.id}`, () => sendJson(`/api/store/team/invites/${i.id}?slug=${encodeURIComponent(slug)}`, "DELETE"), `Invitation to ${i.email} cancelled.`)}
                  className={`${dashButton.danger} ${ring}`}
                >
                  {busy === `cancel-${i.id}` ? "Cancelling…" : "Cancel"}
                  <span className="sr-only"> invitation to {i.name}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <DashEmptyState icon={Mail} title="No invitations waiting" description={team.canInvite ? "People you invite appear here until they accept." : "Invitations appear here once you're on the Standard plan."} />
        )}
      </DashCard>
    </div>
  );
}

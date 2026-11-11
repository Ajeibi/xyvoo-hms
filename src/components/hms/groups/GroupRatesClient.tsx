"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Lock, Plus, Send } from "lucide-react";
import { HmsAlert, HmsCard, HmsField, HmsPill, hmsButton, hmsInput } from "@/components/hms/hms-ui";
import { RATE_CHANNELS, validateRateTemplate, type GroupRateInput, type GroupRateTemplate, type HotelPlanView } from "@/lib/hms/groups/group-rates-shared";
import type { GroupHotel } from "@/lib/hms/groups/group-types";

const EMPTY: GroupRateInput = {
  code: "",
  name: "",
  description: null,
  deriveKind: "percent",
  deriveValue: -10,
  boardBasis: "Room only",
  refundable: true,
  prepayRequired: false,
  channels: ["front_desk", "website"],
  sellFrom: null,
  sellTo: null,
  active: true,
};

function describe(t: Pick<GroupRateInput, "deriveKind" | "deriveValue">) {
  const v = t.deriveValue;
  if (t.deriveKind === "percent") return v === 0 ? "Same as each hotel's standard rate" : `${Math.abs(v)}% ${v < 0 ? "below" : "above"} each hotel's standard rate`;
  return v === 0 ? "Same as each hotel's standard rate" : `${Math.abs(v).toLocaleString("en-NG")} ${v < 0 ? "below" : "above"} each hotel's standard rate, per night`;
}

export function GroupRatesClient({
  groupSlug,
  canEdit,
  hotels,
  templates,
  plansByHotel,
}: {
  groupSlug: string;
  canEdit: boolean;
  hotels: GroupHotel[];
  templates: GroupRateTemplate[];
  plansByHotel: Record<string, HotelPlanView[]>;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<{ id: string | null; form: GroupRateInput } | null>(null);
  const [pushTo, setPushTo] = useState<Record<string, string[]>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function post(body: Record<string, unknown>) {
    const res = await fetch(`/api/hotel/groups/${groupSlug}/rates`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || "That didn't work.");
    return json;
  }

  async function run(work: () => Promise<string>) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      setNotice(await work());
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't work.");
    } finally {
      // Refresh either way: a send to several hotels can work at some and fail at others.
      router.refresh();
      setBusy(false);
    }
  }

  const hotelHas = (tenantId: string, templateId: string) => (plansByHotel[tenantId] ?? []).find((p) => p.groupTemplateId === templateId);
  const formProblem = editing ? validateRateTemplate(editing.form) : null;

  return (
    <div className="space-y-6">
      <div aria-live="polite" className="space-y-2">
        <HmsAlert message={error} />
        {notice ? <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">{notice}</p> : null}
      </div>

      {canEdit && !editing ? (
        <button type="button" className={hmsButton.primary} onClick={() => setEditing({ id: null, form: EMPTY })}>
          <Plus className="h-4 w-4" aria-hidden /> New group rate
        </button>
      ) : null}

      {editing ? (
        <HmsCard id="rate-form" title={editing.id ? "Change group rate" : "New group rate"} description="Worked out from each hotel's own standard (default) rate, so it fits every hotel's prices.">
          <form
            className="grid gap-4 sm:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                const res = (await post({ action: "save", id: editing.id, template: editing.form })) as { updatedHotels: Array<{ ok: boolean }> };
                setEditing(null);
                const n = res.updatedHotels?.length ?? 0;
                return n ? `Saved and updated at ${n} ${n === 1 ? "hotel" : "hotels"}.` : "Saved. Send it to hotels below.";
              });
            }}
          >
            <HmsField id="rt-code" label="Code" hint="Short, e.g. CORP15">
              <input id="rt-code" className={hmsInput} value={editing.form.code} maxLength={24} onChange={(e) => setEditing({ ...editing, form: { ...editing.form, code: e.target.value } })} required />
            </HmsField>
            <HmsField id="rt-name" label="Name">
              <input id="rt-name" className={hmsInput} value={editing.form.name} maxLength={80} onChange={(e) => setEditing({ ...editing, form: { ...editing.form, name: e.target.value } })} required />
            </HmsField>
            <HmsField id="rt-kind" label="Change from the standard rate">
              <select id="rt-kind" className={hmsInput} value={editing.form.deriveKind} onChange={(e) => setEditing({ ...editing, form: { ...editing.form, deriveKind: e.target.value as "percent" | "amount" } })}>
                <option value="percent">Percentage</option>
                <option value="amount">Amount per night</option>
              </select>
            </HmsField>
            <HmsField id="rt-value" label={editing.form.deriveKind === "percent" ? "Percent (minus for a discount)" : "Amount (minus for a discount)"}>
              <input id="rt-value" type="number" step="0.01" className={hmsInput} value={editing.form.deriveValue} onChange={(e) => setEditing({ ...editing, form: { ...editing.form, deriveValue: Number(e.target.value) } })} />
            </HmsField>
            <HmsField id="rt-board" label="Board">
              <input id="rt-board" className={hmsInput} value={editing.form.boardBasis} onChange={(e) => setEditing({ ...editing, form: { ...editing.form, boardBasis: e.target.value } })} />
            </HmsField>
            <div className="grid grid-cols-2 gap-3">
              <HmsField id="rt-from" label="Sell from" optional>
                <input id="rt-from" type="date" className={hmsInput} value={editing.form.sellFrom ?? ""} onChange={(e) => setEditing({ ...editing, form: { ...editing.form, sellFrom: e.target.value || null } })} />
              </HmsField>
              <HmsField id="rt-to" label="Sell to" optional>
                <input id="rt-to" type="date" className={hmsInput} value={editing.form.sellTo ?? ""} onChange={(e) => setEditing({ ...editing, form: { ...editing.form, sellTo: e.target.value || null } })} />
              </HmsField>
            </div>
            <fieldset className="sm:col-span-2">
              <legend className="mb-1 text-sm font-medium text-slate-800">Where it is sold</legend>
              <div className="flex flex-wrap gap-4">
                {RATE_CHANNELS.map((c) => (
                  <label key={c.key} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={editing.form.channels.includes(c.key)}
                      onChange={(e) =>
                        setEditing({ ...editing, form: { ...editing.form, channels: e.target.checked ? [...editing.form.channels, c.key] : editing.form.channels.filter((x) => x !== c.key) } })
                      }
                    />
                    {c.label}
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="flex flex-wrap gap-4 sm:col-span-2">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={editing.form.refundable} onChange={(e) => setEditing({ ...editing, form: { ...editing.form, refundable: e.target.checked } })} /> Refundable
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={editing.form.prepayRequired} onChange={(e) => setEditing({ ...editing, form: { ...editing.form, prepayRequired: e.target.checked } })} /> Paid in advance
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={editing.form.active} onChange={(e) => setEditing({ ...editing, form: { ...editing.form, active: e.target.checked } })} /> On sale
              </label>
            </div>
            <p className="text-sm text-slate-600 sm:col-span-2">{describe(editing.form)}.</p>
            {formProblem ? <p className="text-sm text-amber-800 sm:col-span-2">{formProblem}</p> : null}
            <div className="flex gap-2 sm:col-span-2">
              <button type="submit" disabled={busy || Boolean(formProblem)} className={hmsButton.primary}>
                Save
              </button>
              <button type="button" className={hmsButton.secondary} onClick={() => setEditing(null)}>
                Cancel
              </button>
            </div>
          </form>
        </HmsCard>
      ) : null}

      {templates.length === 0 && !editing ? (
        <p className="text-sm text-slate-600">No group rates yet. A group rate is a plan you set once (for example a corporate discount) and send to your hotels.</p>
      ) : null}

      {templates.map((t) => (
        <HmsCard
          key={t.id}
          id={`tpl-${t.id}`}
          title={`${t.name} (${t.code})`}
          description={`${describe(t)}. ${t.refundable ? "Refundable" : "Non-refundable"}${t.prepayRequired ? ", paid in advance" : ""}. ${t.active ? "" : "Off sale."}`}
          actions={
            canEdit ? (
              <>
                <button type="button" className={hmsButton.small} onClick={() => setEditing({ id: t.id, form: { ...t } })}>
                  Change
                </button>
                <button
                  type="button"
                  disabled={busy}
                  className={hmsButton.danger}
                  onClick={() => window.confirm(`Delete ${t.name}? Hotels keep their copies as their own plans.`) && void run(async () => (await post({ action: "delete", templateId: t.id }), "Deleted."))}
                >
                  Delete
                </button>
              </>
            ) : undefined
          }
        >
          <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
            {hotels.map((h) => {
              const has = hotelHas(h.tenantId, t.id);
              const picked = (pushTo[t.id] ?? []).includes(h.tenantId);
              return (
                <li key={h.tenantId} className="flex flex-wrap items-center gap-3 px-4 py-2 text-sm">
                  {canEdit && !has ? (
                    <input
                      type="checkbox"
                      aria-label={`Send to ${h.name}`}
                      checked={picked}
                      onChange={(e) => setPushTo((s) => ({ ...s, [t.id]: e.target.checked ? [...(s[t.id] ?? []), h.tenantId] : (s[t.id] ?? []).filter((x) => x !== h.tenantId) }))}
                    />
                  ) : null}
                  <span className="min-w-48 flex-1 font-medium text-slate-900">{h.name}</span>
                  {has ? (
                    <>
                      <HmsPill tone={has.active ? "green" : "slate"}>
                        <Lock className="mr-1 inline h-3 w-3" aria-hidden />
                        {has.active ? "Set by the group, on sale" : "Set by the group, switched off by the hotel"}
                      </HmsPill>
                      {canEdit ? (
                        <button type="button" disabled={busy} className={hmsButton.danger} onClick={() => void run(async () => (await post({ action: "withdraw", templateId: t.id, tenantId: h.tenantId }), `Taken off ${h.name}.`))}>
                          Take off
                        </button>
                      ) : null}
                    </>
                  ) : (
                    <span className="text-slate-500">Not at this hotel</span>
                  )}
                </li>
              );
            })}
          </ul>
          {canEdit && (pushTo[t.id] ?? []).length ? (
            <button
              type="button"
              disabled={busy}
              className={`${hmsButton.primary} mt-3`}
              onClick={() =>
                void run(async () => {
                  const res = (await post({ action: "push", templateId: t.id, tenantIds: pushTo[t.id] })) as { results: Array<{ tenantId: string; ok: boolean; error: string | null }> };
                  setPushTo((s) => ({ ...s, [t.id]: [] }));
                  const failed = res.results.filter((r) => !r.ok);
                  const names = new Map(hotels.map((h) => [h.tenantId, h.name]));
                  const sent = res.results.filter((r) => r.ok).map((r) => names.get(r.tenantId));
                  if (failed.length) {
                    const problems = failed.map((f) => `${names.get(f.tenantId)}: ${f.error}`).join(" ");
                    throw new Error(sent.length ? `Sent to ${sent.join(", ")}. Not sent to ${problems}` : problems);
                  }
                  return `Sent to ${res.results.length} ${res.results.length === 1 ? "hotel" : "hotels"}.`;
                })
              }
            >
              <Send className="h-4 w-4" aria-hidden /> Send to {(pushTo[t.id] ?? []).length} {(pushTo[t.id] ?? []).length === 1 ? "hotel" : "hotels"}
            </button>
          ) : null}
        </HmsCard>
      ))}
    </div>
  );
}

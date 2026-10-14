"use client";

import { useId, useMemo, useState } from "react";
import { Plus, Trash2, Users } from "lucide-react";
import { SEGMENT_LABELS, SEGMENTS, type CustomerRow } from "@/lib/store/customers";
import {
  FIELD_OPERATORS,
  inGroup,
  needsValue,
  operatorLabel,
  RULE_FIELD_LABELS,
  RULE_FIELDS,
  type CustomerGroup,
  type CustomerRule,
  type RuleField,
} from "@/lib/store/customer-groups";
import { DashAlert, dashButton, DashCard, DashField, dashInput, sendJson } from "./dashboard-ui";

const focusRing = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-xyvoo-blue focus-visible:ring-offset-2";

type EditableRule = { field: RuleField; op: CustomerRule["op"]; value: string };

const blankRule = (field: RuleField = "totalSpent"): EditableRule => ({ field, op: FIELD_OPERATORS[field][0], value: field === "group" ? SEGMENTS[0] : "" });

const VALUE_HINT: Partial<Record<RuleField, string>> = {
  totalSpent: "Amount, e.g. 100000",
  paidOrders: "Number of orders",
  daysSinceLastOrder: "Number of days",
  daysSinceFirstOrder: "Number of days",
  tag: "Tag, e.g. wholesale",
};

/** Builds or edits a saved customer group, with a live count of who matches as the rules change. */
export default function CustomerGroupForm({
  slug,
  group,
  customers,
  onSaved,
  onDeleted,
  onCancel,
}: {
  slug: string;
  group: CustomerGroup | null;
  customers: CustomerRow[];
  onSaved: (group: CustomerGroup) => void;
  onDeleted: (id: string) => void;
  onCancel: () => void;
}) {
  const id = useId();
  const [name, setName] = useState(group?.name ?? "");
  const [match, setMatch] = useState<"all" | "any">(group?.match ?? "all");
  const [rules, setRules] = useState<EditableRule[]>(
    group ? group.rules.map((r) => ({ field: r.field, op: r.op, value: String(r.value ?? "") })) : [blankRule()],
  );
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState("");
  // Read once so the live count doesn't shift while the form is open.
  const [now] = useState(() => Date.now());

  const usable = useMemo(
    () =>
      rules.filter((r) => {
        if (!needsValue(r.field)) return true;
        if (r.field === "group" || r.field === "tag") return r.value.trim() !== "";
        return r.value.trim() !== "" && Number.isFinite(Number(r.value)) && Number(r.value) >= 0;
      }),
    [rules],
  );
  const matching = useMemo(
    () => (usable.length ? customers.filter((c) => inGroup({ match, rules: usable }, c, now)).length : 0),
    [customers, match, usable, now],
  );

  const setRule = (i: number, patch: Partial<EditableRule>) => setRules((list) => list.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const changeField = (i: number, field: RuleField) => setRule(i, blankRule(field));

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      const body = { slug, name, match, rules: rules.map((r) => ({ field: r.field, op: r.op, value: needsValue(r.field) && ["totalSpent", "paidOrders", "daysSinceLastOrder", "daysSinceFirstOrder"].includes(r.field) ? (r.value.trim() === "" ? "" : Number(r.value)) : r.value })) };
      const data = group ? await sendJson(`/api/store/customers/groups/${group.id}`, "PUT", body) : await sendJson("/api/store/customers/groups", "POST", body);
      onSaved(data.group as CustomerGroup);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!group) return;
    setSaving(true);
    setError("");
    try {
      await sendJson(`/api/store/customers/groups/${group.id}?slug=${encodeURIComponent(slug)}`, "DELETE");
      onDeleted(group.id);
    } catch (e) {
      setError((e as Error).message);
      setSaving(false);
    }
  };

  return (
    <DashCard id="customer-group-form" icon={Users} title={group ? "Change this group" : "Make a new group"} description="Pick the rules. Anyone who fits them is in the group, and the group updates itself as customers order.">
      <div className="space-y-5">
        <DashAlert message={error} />

        <div className="grid gap-4 sm:grid-cols-2">
          <DashField id={`${id}-name`} label="Group name" hint="For example: Big spenders, or Win back.">
            <input id={`${id}-name`} className={dashInput} value={name} onChange={(e) => setName(e.target.value)} maxLength={60} autoComplete="off" aria-describedby={`${id}-name-hint`} />
          </DashField>
          <DashField id={`${id}-match`} label="Who counts as a match?">
            <select id={`${id}-match`} className={dashInput} value={match} onChange={(e) => setMatch(e.target.value as "all" | "any")}>
              <option value="all">Customers who fit all of the rules</option>
              <option value="any">Customers who fit any one of the rules</option>
            </select>
          </DashField>
        </div>

        <fieldset className="space-y-3">
          <legend className="text-sm font-semibold text-slate-900">Rules</legend>
          <ul className="space-y-3">
            {rules.map((rule, i) => (
              <li key={i} className="grid gap-2 rounded-xl border border-slate-200 p-3 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end">
                <DashField id={`${id}-f${i}`} label={`Rule ${i + 1}`}>
                  <select id={`${id}-f${i}`} className={dashInput} value={rule.field} onChange={(e) => changeField(i, e.target.value as RuleField)}>
                    {RULE_FIELDS.map((f) => (
                      <option key={f} value={f}>
                        {RULE_FIELD_LABELS[f]}
                      </option>
                    ))}
                  </select>
                </DashField>
                <DashField id={`${id}-o${i}`} label="Compare">
                  <select id={`${id}-o${i}`} className={dashInput} value={rule.op} onChange={(e) => setRule(i, { op: e.target.value as CustomerRule["op"] })}>
                    {FIELD_OPERATORS[rule.field].map((op) => (
                      <option key={op} value={op}>
                        {operatorLabel(rule.field, op)}
                      </option>
                    ))}
                  </select>
                </DashField>
                {needsValue(rule.field) ? (
                  <DashField id={`${id}-v${i}`} label="Value">
                    {rule.field === "group" ? (
                      <select id={`${id}-v${i}`} className={dashInput} value={rule.value} onChange={(e) => setRule(i, { value: e.target.value })}>
                        {SEGMENTS.map((s) => (
                          <option key={s} value={s}>
                            {SEGMENT_LABELS[s]}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        id={`${id}-v${i}`}
                        className={dashInput}
                        type={rule.field === "tag" ? "text" : "number"}
                        inputMode={rule.field === "tag" ? undefined : "decimal"}
                        min={rule.field === "tag" ? undefined : 0}
                        step={rule.field === "tag" ? undefined : "any"}
                        value={rule.value}
                        placeholder={VALUE_HINT[rule.field]}
                        onChange={(e) => setRule(i, { value: e.target.value })}
                      />
                    )}
                  </DashField>
                ) : (
                  <p className="pb-2.5 text-sm text-slate-600">Nothing more to choose.</p>
                )}
                <button
                  type="button"
                  onClick={() => setRules((list) => (list.length > 1 ? list.filter((_, idx) => idx !== i) : list))}
                  disabled={rules.length === 1}
                  className={`${dashButton.quiet} ${focusRing} justify-self-start disabled:opacity-40`}
                >
                  <Trash2 className="h-4 w-4" aria-hidden /> Remove<span className="sr-only"> rule {i + 1}</span>
                </button>
              </li>
            ))}
          </ul>
          {rules.length < 8 ? (
            <button type="button" onClick={() => setRules((list) => [...list, blankRule()])} className={`${dashButton.secondary} ${focusRing}`}>
              <Plus className="h-4 w-4" aria-hidden /> Add another rule
            </button>
          ) : null}
        </fieldset>

        <p className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-800" role="status">
          {usable.length
            ? `${matching} of your ${customers.length} ${customers.length === 1 ? "customer fits" : "customers fit"} these rules right now.`
            : "Fill in a rule to see who fits."}
        </p>

        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={save} disabled={saving} className={`${dashButton.primary} ${focusRing}`}>
            {saving ? "Saving…" : group ? "Save changes" : "Save group"}
          </button>
          <button type="button" onClick={onCancel} disabled={saving} className={`${dashButton.secondary} ${focusRing}`}>
            Cancel
          </button>
          {group ? (
            confirmDelete ? (
              <span className="flex flex-wrap items-center gap-2 text-sm text-slate-700">
                Remove this group? Your customers aren&rsquo;t affected.
                <button type="button" onClick={remove} disabled={saving} className={`${dashButton.danger} ${focusRing}`}>
                  Yes, remove it
                </button>
                <button type="button" onClick={() => setConfirmDelete(false)} className={`${dashButton.quiet} ${focusRing}`}>
                  Keep it
                </button>
              </span>
            ) : (
              <button type="button" onClick={() => setConfirmDelete(true)} disabled={saving} className={`${dashButton.quiet} ${focusRing} sm:ml-auto`}>
                <Trash2 className="h-4 w-4" aria-hidden /> Remove group
              </button>
            )
          ) : null}
        </div>
      </div>
    </DashCard>
  );
}

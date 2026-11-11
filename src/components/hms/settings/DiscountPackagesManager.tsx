"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BadgePercent } from "lucide-react";
import { HmsCard, HmsEmptyState, HmsField, HmsPill, hmsButton, hmsInput } from "@/components/hms/hms-ui";
import { Button } from "@/components/ui/button";
import { toastError, toastSuccess } from "@/lib/app-toast";
import { SettingsSectionInfo } from "@/components/hms/settings/SettingsSectionInfo";
import { DISCOUNT_PACKAGE_SCOPES, type DiscountPackageRow } from "@/lib/hms/discount-packages";

const scopeLabel = (v: string) => DISCOUNT_PACKAGE_SCOPES.find((s) => s.value === v)?.label ?? v;

function validity(row: DiscountPackageRow) {
  if (row.validFrom && row.validTo) return `${row.validFrom} to ${row.validTo}`;
  if (row.validFrom) return `From ${row.validFrom}`;
  if (row.validTo) return `Until ${row.validTo}`;
  return "No dates";
}

export function DiscountPackagesManager({ slug, rows, threshold }: { slug: string; rows: DiscountPackageRow[]; threshold: number }) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [percent, setPercent] = useState("");
  const [scope, setScope] = useState<DiscountPackageRow["scope"]>("all_nights");
  const [validFrom, setValidFrom] = useState("");
  const [validTo, setValidTo] = useState("");
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [limit, setLimit] = useState(String(threshold));
  const [savingLimit, setSavingLimit] = useState(false);

  const add = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/hotel/discount-packages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, code, name: name || null, percent, scope, validFrom: validFrom || null, validTo: validTo || null }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toastError("Could not save the code", data.error ?? "Try again.");
        return;
      }
      toastSuccess("Discount code added.");
      setCode("");
      setName("");
      setPercent("");
      setValidFrom("");
      setValidTo("");
      router.refresh();
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (row: DiscountPackageRow) => {
    setBusyId(row.id);
    try {
      const res = await fetch(`/api/hotel/discount-packages/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, isActive: !row.isActive }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toastError("Could not update the code", data.error ?? "Try again.");
        return;
      }
      toastSuccess(row.isActive ? "Code switched off." : "Code switched on.");
      router.refresh();
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (row: DiscountPackageRow) => {
    setBusyId(row.id);
    try {
      const res = await fetch(`/api/hotel/discount-packages/${row.id}?slug=${encodeURIComponent(slug)}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toastError("Could not remove the code", data.error ?? "Try again.");
        return;
      }
      toastSuccess("Code removed.");
      router.refresh();
    } finally {
      setBusyId(null);
    }
  };

  const saveLimit = async () => {
    setSavingLimit(true);
    try {
      const res = await fetch("/api/hotel/discount-packages/check", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, threshold: limit }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toastError("Could not save the limit", data.error ?? "Try again.");
        return;
      }
      toastSuccess("Discount limit saved.");
      router.refresh();
    } finally {
      setSavingLimit(false);
    }
  };

  return (
    <HmsCard
      id="discount-packages"
      title="Discount codes"
      description="Promo codes staff type at check-in, and the limit above which a manager must approve a typed discount."
      icon={BadgePercent}
      meaning="money"
      actions={
        <SettingsSectionInfo
          title="Discount codes"
          text="Create a code with a percent, the nights it applies to and the dates it works. At check-in, typing a valid code fills the discount in. An unknown or expired code shows an error. Separately, a discount typed by hand above the limit below needs a manager: an owner or admin signed in, or the manager PIN. Who approved it is recorded on the booking."
        />
      }
    >
      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-[200px_auto] sm:items-end">
        <HmsField id="discount-limit" label="Manager approval above (%)" hint="A typed discount above this percent needs a manager. Codes below never ask.">
          <input id="discount-limit" type="number" min={0} max={100} step="0.5" className={hmsInput} value={limit} onChange={(e) => setLimit(e.target.value)} />
        </HmsField>
        <button type="button" disabled={savingLimit} onClick={() => void saveLimit()} className={hmsButton.secondary}>
          Save limit
        </button>
      </div>

      <div className="divide-y divide-slate-100 rounded-xl border border-slate-200">
        {rows.length === 0 ? (
          <HmsEmptyState bare icon={BadgePercent} meaning="money" title="No discount codes yet" description="Add your first one below, for example SUMMER15 for 15% off." />
        ) : (
          rows.map((row) => (
            <div key={row.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
              <span className="flex flex-wrap items-center gap-2">
                <span className={`font-mono font-semibold ${row.isActive ? "text-slate-900" : "text-slate-600 line-through"}`}>{row.code}</span>
                <span className="text-slate-700">
                  {row.percent}% · {scopeLabel(row.scope)} · {validity(row)}
                </span>
                {row.name ? <span className="text-slate-600">({row.name})</span> : null}
                {!row.isActive ? <HmsPill>Off</HmsPill> : null}
              </span>
              <div className="flex items-center gap-2">
                <Button type="button" size="sm" variant="outline" className="h-9 text-sm" disabled={busyId === row.id} onClick={() => void toggle(row)}>
                  {row.isActive ? "Switch off" : "Switch on"}
                  <span className="sr-only"> {row.code}</span>
                </Button>
                <button type="button" className={hmsButton.danger} disabled={busyId === row.id} onClick={() => void remove(row)}>
                  Delete
                  <span className="sr-only"> {row.code}</span>
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <HmsField id="dp-code" label="Code">
          <input id="dp-code" className={`${hmsInput} uppercase`} placeholder="SUMMER15" maxLength={30} value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} />
        </HmsField>
        <HmsField id="dp-percent" label="Percent off">
          <input id="dp-percent" type="number" min={0.5} max={100} step="0.5" className={hmsInput} value={percent} onChange={(e) => setPercent(e.target.value)} />
        </HmsField>
        <HmsField id="dp-scope" label="Which nights">
          <select id="dp-scope" className={hmsInput} value={scope} onChange={(e) => setScope(e.target.value as DiscountPackageRow["scope"])}>
            {DISCOUNT_PACKAGE_SCOPES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </HmsField>
        <HmsField id="dp-from" label="Works from" optional>
          <input id="dp-from" type="date" className={hmsInput} value={validFrom} onChange={(e) => setValidFrom(e.target.value)} />
        </HmsField>
        <HmsField id="dp-to" label="Works until" optional>
          <input id="dp-to" type="date" className={hmsInput} value={validTo} onChange={(e) => setValidTo(e.target.value)} />
        </HmsField>
        <HmsField id="dp-name" label="Name" optional>
          <input id="dp-name" className={hmsInput} placeholder="Summer offer" maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
        </HmsField>
      </div>
      <div className="mt-3">
        <button type="button" disabled={saving} onClick={() => void add()} className={hmsButton.primary}>
          Add discount code
        </button>
      </div>
    </HmsCard>
  );
}

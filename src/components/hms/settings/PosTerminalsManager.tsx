"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CreditCard } from "lucide-react";
import { HmsCard, HmsEmptyState, HmsField, HmsPill, hmsButton, hmsInput } from "@/components/hms/hms-ui";
import { Button } from "@/components/ui/button";
import { toastError, toastSuccess } from "@/lib/app-toast";
import { SettingsSectionInfo } from "@/components/hms/settings/SettingsSectionInfo";
import type { PosTerminalRow } from "@/lib/hms/pos-terminals";

export function PosTerminalsManager({ slug, rows }: { slug: string; rows: PosTerminalRow[] }) {
  const router = useRouter();
  const [newName, setNewName] = useState("");
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const add = async () => {
    if (!newName.trim()) {
      toastError("Enter a name", "For example Moniepoint or First Bank.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/hotel/pos-terminals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, name: newName.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toastError("Could not add the card machine", data.error ?? "Try again.");
        return;
      }
      toastSuccess("Card machine added.");
      setNewName("");
      router.refresh();
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (row: PosTerminalRow) => {
    setBusyId(row.id);
    try {
      const res = await fetch(`/api/hotel/pos-terminals/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, isActive: !row.isActive }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toastError("Could not update the card machine", data.error ?? "Try again.");
        return;
      }
      toastSuccess(row.isActive ? "Card machine switched off." : "Card machine switched on.");
      router.refresh();
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (row: PosTerminalRow) => {
    setBusyId(row.id);
    try {
      const res = await fetch(`/api/hotel/pos-terminals/${row.id}?slug=${encodeURIComponent(slug)}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toastError("Could not remove the card machine", data.error ?? "Try again.");
        return;
      }
      toastSuccess("Card machine removed.");
      router.refresh();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <HmsCard
      id="pos-terminals"
      title="Card machines"
      description="The POS machines at your desk. Each card payment says which machine took it."
      icon={CreditCard}
      meaning="money"
      actions={
        <SettingsSectionInfo
          title="Card machines"
          text="List the card machines your hotel uses (for example Moniepoint or First Bank). When staff record a payment as Card machine (POS) they choose which one, so the folio, receipt and end-of-day report show it. The system only records the payment; the guest's card is taken on the machine. Switch a machine off to stop it being offered; old payments keep its name."
        />
      }
    >
      <div className="divide-y divide-slate-100 rounded-xl border border-slate-200">
        {rows.length === 0 ? (
          <HmsEmptyState bare icon={CreditCard} meaning="money" title="No card machines yet" description="Add your first one below, for example Moniepoint." />
        ) : (
          rows.map((row) => (
            <div key={row.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
              <span className="flex items-center gap-2">
                <span className={`font-medium ${row.isActive ? "text-slate-900" : "text-slate-600 line-through"}`}>{row.name}</span>
                {!row.isActive ? <HmsPill>Off</HmsPill> : null}
              </span>
              <div className="flex items-center gap-2">
                <Button type="button" size="sm" variant="outline" className="h-9 text-sm" disabled={busyId === row.id} onClick={() => void toggle(row)}>
                  {row.isActive ? "Switch off" : "Switch on"}
                  <span className="sr-only"> {row.name}</span>
                </Button>
                <button type="button" className={hmsButton.danger} disabled={busyId === row.id} onClick={() => void remove(row)}>
                  Delete
                  <span className="sr-only"> {row.name}</span>
                </button>
              </div>
            </div>
          ))
        )}
      </div>
      <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
        <HmsField id="pos-terminal-new-name" label="New card machine">
          <input
            id="pos-terminal-new-name"
            className={hmsInput}
            placeholder="For example, Moniepoint"
            value={newName}
            maxLength={60}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void add();
              }
            }}
          />
        </HmsField>
        <button type="button" disabled={saving} onClick={() => void add()} className={hmsButton.primary}>
          Add card machine
        </button>
      </div>
    </HmsCard>
  );
}

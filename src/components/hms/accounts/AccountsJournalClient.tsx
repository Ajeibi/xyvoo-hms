"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { toastError, toastSuccess } from "@/lib/app-toast";
import { formatDateTime } from "@/lib/format-date";
import type { ChartOfAccountRow } from "@/lib/hms/chart-of-accounts";
import {
  ACCOUNTS_DEPARTMENTS,
  type JournalEntryDetail,
  type JournalEntryRow,
} from "@/lib/hms/journal-entries";
import { AccountsSubNav } from "@/components/hms/accounts/AccountsSubNav";

type DraftLine = { accountId: string; department: string; description: string; debit: string; credit: string };

function emptyLine(): DraftLine {
  return { accountId: "", department: "", description: "", debit: "", credit: "" };
}

export function AccountsJournalClient({
  slug,
  accounts,
  entries,
  canPost,
  canReverse,
  canAccessAllDepartments,
}: {
  slug: string;
  accounts: ChartOfAccountRow[];
  entries: JournalEntryRow[];
  canPost: boolean;
  canReverse: boolean;
  canAccessAllDepartments: boolean;
}) {
  const router = useRouter();
  const [createOpen, setCreateOpen] = useState(false);
  const [entryDate, setEntryDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [memo, setMemo] = useState("");
  const [reference, setReference] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([emptyLine(), emptyLine()]);
  const [saving, setSaving] = useState(false);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<JournalEntryDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [reversing, setReversing] = useState(false);

  const totals = useMemo(() => {
    let debit = 0;
    let credit = 0;
    for (const l of lines) {
      debit += Number(l.debit) || 0;
      credit += Number(l.credit) || 0;
    }
    return { debit, credit, balanced: Math.abs(debit - credit) < 0.01 && debit > 0 };
  }, [lines]);

  const updateLine = (i: number, patch: Partial<DraftLine>) => {
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  };
  const addLine = () => setLines((prev) => [...prev, emptyLine()]);
  const removeLine = (i: number) => setLines((prev) => (prev.length > 2 ? prev.filter((_, idx) => idx !== i) : prev));

  const resetForm = () => {
    setEntryDate(new Date().toISOString().slice(0, 10));
    setMemo("");
    setReference("");
    setLines([emptyLine(), emptyLine()]);
  };

  const submitEntry = async () => {
    if (!memo.trim()) {
      toastError("Memo required", "Describe what this entry is for.");
      return;
    }
    const payloadLines = lines
      .filter((l) => l.accountId && (Number(l.debit) > 0 || Number(l.credit) > 0))
      .map((l) => ({
        accountId: l.accountId,
        department: l.department || null,
        description: l.description.trim() || null,
        debit: Number(l.debit) || 0,
        credit: Number(l.credit) || 0,
      }));
    if (payloadLines.length < 2) {
      toastError("At least two lines required", "Add both sides of the entry.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/hotel/accounts/journal-entries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, entryDate, memo: memo.trim(), reference: reference.trim() || undefined, lines: payloadLines }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toastError("Could not post entry", data.error ?? "Try again.");
        return;
      }
      toastSuccess("Journal entry posted.");
      setCreateOpen(false);
      resetForm();
      router.refresh();
    } finally {
      setSaving(false);
    }
  };

  const openDetail = async (id: string) => {
    setSelectedId(id);
    setDetail(null);
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/hotel/accounts/journal-entries/${id}?${new URLSearchParams({ slug })}`);
      const data = await res.json().catch(() => null);
      if (res.ok) setDetail(data);
    } finally {
      setDetailLoading(false);
    }
  };

  const reverseEntry = async () => {
    if (!selectedId) return;
    setReversing(true);
    try {
      const res = await fetch(`/api/hotel/accounts/journal-entries/${selectedId}/reverse`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toastError("Could not reverse entry", data.error ?? "Try again.");
        return;
      }
      toastSuccess("Entry reversed.");
      setSelectedId(null);
      setDetail(null);
      router.refresh();
    } finally {
      setReversing(false);
    }
  };

  return (
    <div className="w-full px-6 py-8 sm:px-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Journal entries</h1>
          <p className="mt-0.5 text-sm text-slate-500">Every balanced posting to the ledger, most recent first.</p>
        </div>
        {canPost ? (
          <Button type="button" onClick={() => setCreateOpen(true)} disabled={accounts.length === 0}>
            New entry
          </Button>
        ) : null}
      </div>

      <AccountsSubNav slug={slug} canAccessAllDepartments={canAccessAllDepartments} />

      {accounts.length === 0 ? (
        <div className="mt-6 rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
          Set up the chart of accounts before posting journal entries.
        </div>
      ) : entries.length === 0 ? (
        <div className="mt-6 rounded-xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
          No journal entries posted yet.
        </div>
      ) : (
        <div className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="border-b bg-slate-50 text-xs font-semibold uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Memo</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Total</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/80">
                  <td className="whitespace-nowrap px-4 py-2.5 text-slate-600">{new Date(e.entryDate).toLocaleDateString()}</td>
                  <td className="px-4 py-2.5 font-medium text-slate-900">{e.memo}</td>
                  <td className="px-4 py-2.5">
                    {e.reversedBy ? (
                      <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-semibold text-slate-700">Reversed</span>
                    ) : e.reversedOf ? (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900">Reversal</span>
                    ) : (
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-900">Posted</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums text-slate-700">{e.total.toFixed(2)}</td>
                  <td className="px-4 py-2.5">
                    <Button type="button" size="sm" variant="outline" onClick={() => void openDetail(e.id)}>
                      View
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>New journal entry</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <p className="mb-1 text-xs font-medium text-slate-600">Date</p>
                <Input type="date" value={entryDate} onChange={(e) => setEntryDate(e.target.value)} />
              </div>
              <div className="sm:col-span-2">
                <p className="mb-1 text-xs font-medium text-slate-600">Memo</p>
                <Input value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="What is this entry for?" />
              </div>
            </div>
            <div>
              <p className="mb-1 text-xs font-medium text-slate-600">Reference (optional)</p>
              <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="e.g. invoice or PO number" />
            </div>

            <div className="rounded-lg border border-slate-200">
              <div className="grid grid-cols-[1fr_110px_1fr_90px_90px_28px] gap-2 border-b border-slate-100 bg-slate-50 px-3 py-2 text-xs font-semibold uppercase text-slate-500">
                <span>Account</span>
                <span>Department</span>
                <span>Description</span>
                <span>Debit</span>
                <span>Credit</span>
                <span />
              </div>
              <div className="max-h-72 overflow-y-auto">
                {lines.map((line, i) => (
                  <div key={i} className="grid grid-cols-[1fr_110px_1fr_90px_90px_28px] gap-2 border-b border-slate-50 px-3 py-2 last:border-0">
                    <select
                      className="h-9 w-full rounded-md border border-input px-2 text-xs"
                      value={line.accountId}
                      onChange={(e) => updateLine(i, { accountId: e.target.value })}
                    >
                      <option value="">Select…</option>
                      {accounts.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.code} {a.name}
                        </option>
                      ))}
                    </select>
                    <select
                      className="h-9 w-full rounded-md border border-input px-1 text-xs"
                      value={line.department}
                      onChange={(e) => updateLine(i, { department: e.target.value })}
                    >
                      <option value="">—</option>
                      {ACCOUNTS_DEPARTMENTS.map((d) => (
                        <option key={d} value={d}>
                          {d}
                        </option>
                      ))}
                    </select>
                    <Input
                      className="h-9 text-xs"
                      value={line.description}
                      onChange={(e) => updateLine(i, { description: e.target.value })}
                      placeholder="Optional"
                    />
                    <Input
                      className="h-9 text-xs"
                      type="number"
                      min="0"
                      step="0.01"
                      value={line.debit}
                      onChange={(e) => updateLine(i, { debit: e.target.value, credit: e.target.value ? "" : line.credit })}
                    />
                    <Input
                      className="h-9 text-xs"
                      type="number"
                      min="0"
                      step="0.01"
                      value={line.credit}
                      onChange={(e) => updateLine(i, { credit: e.target.value, debit: e.target.value ? "" : line.debit })}
                    />
                    <button
                      type="button"
                      className="text-slate-400 hover:text-red-600 disabled:opacity-30"
                      disabled={lines.length <= 2}
                      onClick={() => removeLine(i)}
                      aria-label="Remove line"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between border-t border-slate-100 px-3 py-2">
                <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={addLine}>
                  + Add line
                </Button>
                <p className={cn("text-xs font-medium tabular-nums", totals.balanced ? "text-emerald-700" : "text-red-600")}>
                  Debit {totals.debit.toFixed(2)} · Credit {totals.credit.toFixed(2)}
                  {!totals.balanced ? " — not balanced" : ""}
                </p>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button type="button" disabled={saving || !totals.balanced} onClick={() => void submitEntry()}>
              {saving ? "Posting…" : "Post entry"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={selectedId != null} onOpenChange={(open) => !open && setSelectedId(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Journal entry</DialogTitle>
          </DialogHeader>
          {detailLoading || !detail ? (
            <p className="text-sm text-slate-500">Loading…</p>
          ) : (
            <div className="space-y-3">
              <div className="text-sm">
                <p className="font-medium text-slate-900">{detail.memo}</p>
                <p className="text-xs text-slate-500">
                  {formatDateTime(detail.createdAt)}
                  {detail.reference ? ` · Ref ${detail.reference}` : ""}
                </p>
              </div>
              <div className="rounded-lg border border-slate-200">
                <div className="grid grid-cols-[1fr_90px_90px] gap-2 border-b border-slate-100 bg-slate-50 px-3 py-1.5 text-xs font-semibold uppercase text-slate-500">
                  <span>Account</span>
                  <span className="text-right">Debit</span>
                  <span className="text-right">Credit</span>
                </div>
                {detail.lines.map((l) => (
                  <div key={l.id} className="grid grid-cols-[1fr_90px_90px] gap-2 border-b border-slate-50 px-3 py-1.5 text-xs last:border-0">
                    <span>
                      {l.accountCode} {l.accountName}
                      {l.department ? <span className="ml-1 text-slate-400">· {l.department}</span> : null}
                    </span>
                    <span className="text-right tabular-nums">{l.debit > 0 ? l.debit.toFixed(2) : ""}</span>
                    <span className="text-right tabular-nums">{l.credit > 0 ? l.credit.toFixed(2) : ""}</span>
                  </div>
                ))}
              </div>
              {detail.reversedBy ? (
                <p className="text-xs font-medium text-slate-500">This entry has already been reversed.</p>
              ) : detail.reversedOf ? (
                <p className="text-xs font-medium text-amber-700">This entry reverses another entry.</p>
              ) : canReverse ? (
                <Button type="button" variant="outline" disabled={reversing} onClick={() => void reverseEntry()}>
                  {reversing ? "Reversing…" : "Reverse entry"}
                </Button>
              ) : null}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

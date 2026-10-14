"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toastError, toastSuccess } from "@/lib/app-toast";
import { formatDateTime } from "@/lib/format-date";
import type { ChartOfAccountRow } from "@/lib/hms/chart-of-accounts";
import {
  ACCOUNTS_DEPARTMENTS,
  type JournalEntryDetail,
  type JournalEntryRow,
} from "@/lib/hms/journal-entries";
import { AccountsSubNav } from "@/components/hms/accounts/AccountsSubNav";
import { HmsCard, HmsEmptyState, HmsField, HmsPage, HmsPageHeader, HmsPill, hmsButton, hmsInput } from "@/components/hms/hms-ui";
import { HmsSectionIntro } from "@/components/hms/hms-ui-client";
import { CircleAlert, CircleCheck, NotebookPen, Plus, X } from "lucide-react";

type DraftLine = { accountId: string; department: string; description: string; debit: string; credit: string };

function emptyLine(): DraftLine {
  return { accountId: "", department: "", description: "", debit: "", credit: "" };
}

const lineInput =
  "h-10 w-full rounded-lg border border-slate-300 bg-white px-2 text-sm text-slate-900 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500";

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

  const detailTotals = detail
    ? detail.lines.reduce((acc, l) => ({ debit: acc.debit + l.debit, credit: acc.credit + l.credit }), { debit: 0, credit: 0 })
    : null;
  const detailBalanced = detailTotals ? Math.abs(detailTotals.debit - detailTotals.credit) < 0.01 : true;

  return (
    <HmsPage wide>
      <HmsPageHeader
        eyebrow="Accounts"
        meaning="money"
        title="Journal entries"
        description="Every balanced posting to the ledger, most recent first."
        actions={
          canPost ? (
            <button type="button" className={hmsButton.primary} onClick={() => setCreateOpen(true)} disabled={accounts.length === 0}>
              <Plus className="h-4 w-4" aria-hidden />
              New entry
            </button>
          ) : null
        }
      />

      <AccountsSubNav slug={slug} canAccessAllDepartments={canAccessAllDepartments} />

      <HmsSectionIntro
        id="accounts-journal"
        meaning="money"
        art="page"
        title="How journal entries work"
        points={[
          "Each entry moves money between at least two accounts.",
          "Debits and credits must match before an entry can be posted.",
          "Posted entries can't be edited. To undo one, reverse it.",
        ]}
      />

      {accounts.length === 0 ? (
        <HmsEmptyState
          art="page"
          meaning="money"
          title="Set up your chart of accounts first"
          description="Journal entries post against accounts, so you'll need some before you can post."
        />
      ) : (
        <HmsCard id="accounts-journal-list" title="Posted entries" icon={NotebookPen} meaning="money" flush>
          {entries.length === 0 ? (
            <HmsEmptyState bare art="page" meaning="money" title="No journal entries posted yet" description="Entries you post will appear here, newest first." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-sm font-medium text-slate-600">
                  <tr>
                    <th scope="col" className="px-5 py-3">Date</th>
                    <th scope="col" className="px-5 py-3">Memo</th>
                    <th scope="col" className="px-5 py-3">Status</th>
                    <th scope="col" className="px-5 py-3 text-right">Total</th>
                    <th scope="col" className="px-5 py-3">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((e) => (
                    <tr key={e.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                      <td className="whitespace-nowrap px-5 py-3 text-slate-600">{new Date(e.entryDate).toLocaleDateString()}</td>
                      <td className="px-5 py-3 font-medium text-slate-900">{e.memo}</td>
                      <td className="px-5 py-3">
                        {e.reversedBy ? (
                          <HmsPill tone="slate">Reversed</HmsPill>
                        ) : e.reversedOf ? (
                          <HmsPill tone="amber">Reversal</HmsPill>
                        ) : (
                          <HmsPill tone="green">Posted</HmsPill>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-5 py-3 text-right tabular-nums text-slate-900">{e.total.toFixed(2)}</td>
                      <td className="px-5 py-3 text-right">
                        <button type="button" className={hmsButton.quiet} onClick={() => void openDetail(e.id)}>
                          View<span className="sr-only"> entry: {e.memo}</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </HmsCard>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>New journal entry</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <HmsField id="je-date" label="Date">
                <input id="je-date" type="date" className={hmsInput} value={entryDate} onChange={(e) => setEntryDate(e.target.value)} />
              </HmsField>
              <div className="sm:col-span-2">
                <HmsField id="je-memo" label="Memo" hint="A short note on what this entry is for.">
                  <input
                    id="je-memo"
                    className={hmsInput}
                    aria-describedby="je-memo-hint"
                    value={memo}
                    onChange={(e) => setMemo(e.target.value)}
                    placeholder="What is this entry for?"
                  />
                </HmsField>
              </div>
            </div>
            <HmsField id="je-reference" label="Reference" optional>
              <input
                id="je-reference"
                className={hmsInput}
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="e.g. invoice or PO number"
              />
            </HmsField>

            <fieldset className="rounded-xl border border-slate-200">
              <legend className="sr-only">Entry lines</legend>
              <div
                aria-hidden
                className="grid grid-cols-[1fr_110px_1fr_90px_90px_36px] gap-2 border-b border-slate-100 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-600"
              >
                <span>Account</span>
                <span>Department</span>
                <span>Description</span>
                <span className="text-right">Debit</span>
                <span className="text-right">Credit</span>
                <span />
              </div>
              <div className="max-h-72 overflow-y-auto">
                {lines.map((line, i) => (
                  <div key={i} className="grid grid-cols-[1fr_110px_1fr_90px_90px_36px] items-center gap-2 border-b border-slate-100 px-3 py-2 last:border-0">
                    <select
                      aria-label={`Line ${i + 1} account`}
                      className={lineInput}
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
                      aria-label={`Line ${i + 1} department`}
                      className={lineInput}
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
                    <input
                      aria-label={`Line ${i + 1} description`}
                      className={lineInput}
                      value={line.description}
                      onChange={(e) => updateLine(i, { description: e.target.value })}
                      placeholder="Optional"
                    />
                    <input
                      aria-label={`Line ${i + 1} debit`}
                      className={`${lineInput} text-right tabular-nums`}
                      type="number"
                      min="0"
                      step="0.01"
                      value={line.debit}
                      onChange={(e) => updateLine(i, { debit: e.target.value, credit: e.target.value ? "" : line.credit })}
                    />
                    <input
                      aria-label={`Line ${i + 1} credit`}
                      className={`${lineInput} text-right tabular-nums`}
                      type="number"
                      min="0"
                      step="0.01"
                      value={line.credit}
                      onChange={(e) => updateLine(i, { credit: e.target.value, debit: e.target.value ? "" : line.debit })}
                    />
                    <button
                      type="button"
                      className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-600 hover:bg-red-50 hover:text-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-30"
                      disabled={lines.length <= 2}
                      onClick={() => removeLine(i)}
                      aria-label={`Remove line ${i + 1}`}
                    >
                      <X className="h-4 w-4" aria-hidden />
                    </button>
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 bg-slate-50 px-3 py-2.5">
                <button type="button" className={hmsButton.quiet} onClick={addLine}>
                  <Plus className="h-4 w-4" aria-hidden />
                  Add line
                </button>
                <p
                  aria-live="polite"
                  className={`flex items-center gap-1.5 text-sm font-semibold tabular-nums ${totals.balanced ? "text-emerald-800" : "text-rose-700"}`}
                >
                  {totals.balanced ? <CircleCheck className="h-4 w-4" aria-hidden /> : <CircleAlert className="h-4 w-4" aria-hidden />}
                  Debit {totals.debit.toFixed(2)} · Credit {totals.credit.toFixed(2)}
                  {totals.balanced ? " · Balanced" : " · Not balanced"}
                </p>
              </div>
            </fieldset>
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
            <p role="status" className="text-sm text-slate-600">
              Loading…
            </p>
          ) : (
            <div className="space-y-3">
              <div className="text-sm">
                <p className="font-medium text-slate-900">{detail.memo}</p>
                <p className="text-sm text-slate-600">
                  {formatDateTime(detail.createdAt)}
                  {detail.reference ? ` · Ref ${detail.reference}` : ""}
                </p>
              </div>
              <table className="w-full overflow-hidden rounded-xl border border-slate-200 text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-left font-medium text-slate-600">
                  <tr>
                    <th scope="col" className="px-3 py-2">Account</th>
                    <th scope="col" className="w-24 px-3 py-2 text-right">Debit</th>
                    <th scope="col" className="w-24 px-3 py-2 text-right">Credit</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.lines.map((l) => (
                    <tr key={l.id} className="border-b border-slate-100 last:border-0">
                      <td className="px-3 py-2 text-slate-900">
                        {l.accountCode} {l.accountName}
                        {l.department ? <span className="ml-1 text-slate-600">· {l.department}</span> : null}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{l.debit > 0 ? l.debit.toFixed(2) : ""}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{l.credit > 0 ? l.credit.toFixed(2) : ""}</td>
                    </tr>
                  ))}
                </tbody>
                {detailTotals ? (
                  <tfoot>
                    <tr className="border-t-2 border-slate-300 bg-slate-50 font-semibold text-slate-900">
                      <th scope="row" className="px-3 py-2 text-left">Total</th>
                      <td className="px-3 py-2 text-right tabular-nums">{detailTotals.debit.toFixed(2)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{detailTotals.credit.toFixed(2)}</td>
                    </tr>
                  </tfoot>
                ) : null}
              </table>
              {!detailBalanced ? (
                <p role="alert" className="flex items-center gap-1.5 rounded-xl bg-rose-50 px-3 py-2 text-sm font-medium text-rose-800">
                  <CircleAlert className="h-4 w-4 shrink-0" aria-hidden />
                  Not balanced: debits and credits on this entry don&apos;t match.
                </p>
              ) : null}
              {detail.reversedBy ? (
                <p className="text-sm font-medium text-slate-700">This entry has already been reversed.</p>
              ) : detail.reversedOf ? (
                <p className="text-sm font-medium text-amber-800">This entry reverses another entry.</p>
              ) : canReverse ? (
                <Button type="button" variant="outline" disabled={reversing} onClick={() => void reverseEntry()}>
                  {reversing ? "Reversing…" : "Reverse entry"}
                </Button>
              ) : null}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </HmsPage>
  );
}

"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, BookOpen, CircleAlert, CircleCheck, ClipboardList, FileSpreadsheet, Landmark, Scale, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toastError, toastSuccess } from "@/lib/app-toast";
import type { BankReconciliationDetail, SuggestedMatch } from "@/lib/hms/bank-reconciliation";
import { HmsCard, HmsEmptyState, HmsField, HmsPage, HmsPageHeader, HmsPill, HmsStatStrip, HmsStatTile, hmsButton, hmsInput } from "@/components/hms/hms-ui";

export function AccountsBankReconciliationDetailClient({
  slug,
  initialDetail,
  accountLabel,
  currency,
  canReconcile,
}: {
  slug: string;
  initialDetail: BankReconciliationDetail;
  accountLabel: string;
  currency: string;
  canReconcile: boolean;
}) {
  const router = useRouter();
  const [detail, setDetail] = useState(initialDetail);
  const [uploading, setUploading] = useState(false);
  const [addLineOpen, setAddLineOpen] = useState(false);
  const [manualDate, setManualDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [manualDescription, setManualDescription] = useState("");
  const [manualAmount, setManualAmount] = useState("");
  const [manualReference, setManualReference] = useState("");
  const [savingLine, setSavingLine] = useState(false);
  const [matchingLineId, setMatchingLineId] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<SuggestedMatch[]>([]);
  const [selectedCandidates, setSelectedCandidates] = useState<Set<string>>(new Set());
  const [loadingCandidates, setLoadingCandidates] = useState(false);
  const [busy, setBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const reload = async () => {
    const res = await fetch(`/api/hotel/accounts/bank-reconciliations/${detail.reconciliation.id}?slug=${encodeURIComponent(slug)}`);
    if (res.ok) setDetail(await res.json());
    router.refresh();
  };

  const uploadFile = async (file: File) => {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("slug", slug);
      formData.append("file", file);
      const res = await fetch(`/api/hotel/accounts/bank-reconciliations/${detail.reconciliation.id}/import`, {
        method: "POST",
        body: formData,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toastError("Could not import statement", data.error ?? "Try again.");
        return;
      }
      toastSuccess(
        `Imported ${data.inserted} line${data.inserted === 1 ? "" : "s"}` +
          (data.duplicates > 0 ? ` (${data.duplicates} duplicate${data.duplicates === 1 ? "" : "s"} skipped)` : "") +
          (data.skipped?.length > 0 ? ` — ${data.skipped.length} row(s) couldn't be read` : ""),
      );
      void reload();
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const addManualLine = async () => {
    if (!manualDescription.trim() || manualAmount.trim() === "") {
      toastError("Description and amount required", "Fill in both fields.");
      return;
    }
    setSavingLine(true);
    try {
      const res = await fetch(`/api/hotel/accounts/bank-reconciliations/${detail.reconciliation.id}/lines`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug,
          lineDate: manualDate,
          description: manualDescription.trim(),
          amount: Number(manualAmount),
          reference: manualReference.trim() || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toastError("Could not add line", data.error ?? "Try again.");
        return;
      }
      toastSuccess("Line added");
      setAddLineOpen(false);
      setManualDescription("");
      setManualAmount("");
      setManualReference("");
      void reload();
    } finally {
      setSavingLine(false);
    }
  };

  const openMatchDialog = async (lineId: string) => {
    setMatchingLineId(lineId);
    setSelectedCandidates(new Set());
    setLoadingCandidates(true);
    try {
      const res = await fetch(`/api/hotel/accounts/bank-reconciliations/${detail.reconciliation.id}/lines/${lineId}/suggestions?slug=${encodeURIComponent(slug)}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toastError("Could not load matches", data.error ?? "Try again.");
        setCandidates([]);
        return;
      }
      const list: SuggestedMatch[] = data.candidates ?? [];
      setCandidates(list);
      const exact = list.find((c) => c.exact);
      if (exact) setSelectedCandidates(new Set([exact.journalEntryLineId]));
    } finally {
      setLoadingCandidates(false);
    }
  };

  const matchingLine = detail.lines.find((l) => l.id === matchingLineId);
  const toggleCandidate = (id: string) =>
    setSelectedCandidates((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const selectedTotal = candidates
    .filter((c) => selectedCandidates.has(c.journalEntryLineId))
    .reduce((sum, c) => sum + (c.debit - c.credit), 0);
  const selectedSumsMatch = matchingLine ? Math.abs(selectedTotal - matchingLine.amount) <= 0.01 : false;

  const confirmMatch = async () => {
    if (!matchingLineId || selectedCandidates.size === 0) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/hotel/accounts/bank-reconciliations/${detail.reconciliation.id}/lines/${matchingLineId}/match`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, journalEntryLineIds: [...selectedCandidates] }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toastError("Could not match", data.error ?? "Try again.");
        return;
      }
      toastSuccess("Matched");
      setMatchingLineId(null);
      void reload();
    } finally {
      setBusy(false);
    }
  };

  const unmatch = async (lineId: string) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/hotel/accounts/bank-reconciliations/${detail.reconciliation.id}/lines/${lineId}/unmatch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toastError("Could not unmatch", data.error ?? "Try again.");
        return;
      }
      toastSuccess("Unmatched");
      void reload();
    } finally {
      setBusy(false);
    }
  };

  const complete = async (confirmImbalance?: boolean) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/hotel/accounts/bank-reconciliations/${detail.reconciliation.id}/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, confirmImbalance }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (!confirmImbalance && typeof data.difference === "number") {
          if (confirm(`${data.error} Complete anyway?`)) {
            await complete(true);
            return;
          }
          return;
        }
        toastError("Could not complete", data.error ?? "Try again.");
        return;
      }
      toastSuccess("Reconciliation completed");
      void reload();
    } finally {
      setBusy(false);
    }
  };

  const reopen = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/hotel/accounts/bank-reconciliations/${detail.reconciliation.id}/reopen`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toastError("Could not reopen", data.error ?? "Try again.");
        return;
      }
      toastSuccess("Reconciliation reopened");
      void reload();
    } finally {
      setBusy(false);
    }
  };

  const isCompleted = detail.reconciliation.status === "completed";

  return (
    <HmsPage wide>
      <Link
        href={`/hms/${slug}/accounts/bank-reconciliation`}
        className="inline-flex items-center gap-1.5 rounded text-sm font-medium text-blue-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 print:hidden"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Bank reconciliation
      </Link>
      <HmsPageHeader
        eyebrow="Accounts"
        meaning="money"
        title={accountLabel}
        description={`Statement period ending ${new Date(detail.reconciliation.periodEndDate).toLocaleDateString()}${currency ? ` (${currency})` : ""}`}
        actions={<HmsPill tone={isCompleted ? "green" : "amber"}>{isCompleted ? "Completed" : "In progress"}</HmsPill>}
      />

      <HmsStatStrip label="Reconciliation totals">
        <HmsStatTile icon={BookOpen} meaning="money" label="Book balance" value={detail.bookBalance.toFixed(2)} hint="Everything in the ledger" />
        <HmsStatTile
          icon={CircleCheck}
          meaning="money"
          label="Cleared book balance"
          value={detail.clearedBookBalance.toFixed(2)}
          hint="Ledger items matched to the statement"
        />
        <HmsStatTile
          icon={Landmark}
          meaning="money"
          label="Statement balance"
          value={detail.reconciliation.statementEndingBalance.toFixed(2)}
          hint="From the bank statement"
        />
        <HmsStatTile
          icon={Scale}
          meaning={detail.balanced ? "money" : "attention"}
          label={detail.balanced ? "Balanced" : "Difference"}
          value={detail.balanced ? "0.00" : detail.difference.toFixed(2)}
          hint={detail.balanced ? "Statement and cleared balance agree" : undefined}
          status={detail.balanced ? undefined : "critical"}
          statusText="Not balanced: statement and cleared balance differ"
        />
      </HmsStatStrip>

      {canReconcile && !isCompleted ? (
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm print:hidden">
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void uploadFile(file);
            }}
          />
          <button type="button" className={hmsButton.secondary} disabled={uploading} onClick={() => fileInputRef.current?.click()}>
            <Upload className="h-4 w-4" aria-hidden /> {uploading ? "Importing…" : "Import statement CSV"}
          </button>
          <button type="button" className={hmsButton.secondary} onClick={() => setAddLineOpen(true)}>
            Add line manually
          </button>
          <button type="button" className={`${hmsButton.primary} sm:ml-auto`} disabled={busy} onClick={() => void complete()}>
            Complete reconciliation
          </button>
        </div>
      ) : isCompleted && canReconcile ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm print:border-0 print:p-0 print:shadow-none">
          <p className="text-sm text-slate-700">
            Completed {detail.reconciliation.completedAt ? new Date(detail.reconciliation.completedAt).toLocaleString() : ""}. Final
            difference <span className="font-semibold tabular-nums">{detail.reconciliation.finalDifference?.toFixed(2) ?? "0.00"}</span>.
          </p>
          <button type="button" className={`${hmsButton.secondary} print:hidden`} disabled={busy} onClick={() => void reopen()}>
            Reopen
          </button>
        </div>
      ) : null}

      <HmsCard
        id="bank-rec-statement-lines"
        title="Statement lines"
        description="Each line from the bank statement, and whether it's matched to the ledger."
        icon={FileSpreadsheet}
        meaning="money"
        flush
        className="print:border-0 print:shadow-none"
      >
        {detail.lines.length === 0 ? (
          <HmsEmptyState
            bare
            icon={FileSpreadsheet}
            meaning="money"
            title="No statement lines yet"
            description="Import the bank's CSV statement or add lines one at a time."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-sm font-medium text-slate-600">
                <tr>
                  <th scope="col" className="px-5 py-3">Date</th>
                  <th scope="col" className="px-5 py-3">Description</th>
                  <th scope="col" className="px-5 py-3 text-right">Amount</th>
                  <th scope="col" className="px-5 py-3">Status</th>
                  <th scope="col" className="px-5 py-3 print:hidden">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {detail.lines.map((l) => {
                  const matched = l.matchedJournalEntryLineIds.length > 0;
                  return (
                    <tr key={l.id} className="border-b border-slate-100 last:border-0">
                      <td className="whitespace-nowrap px-5 py-3 text-slate-700">{new Date(l.lineDate).toLocaleDateString()}</td>
                      <td className="px-5 py-3 text-slate-900">
                        {l.description}
                        {l.reference ? <span className="text-slate-600"> · {l.reference}</span> : null}
                      </td>
                      <td className="whitespace-nowrap px-5 py-3 text-right tabular-nums text-slate-900">{l.amount.toFixed(2)}</td>
                      <td className="px-5 py-3">
                        <HmsPill tone={matched ? "green" : "slate"}>
                          {matched ? `Matched (${l.matchedJournalEntryLineIds.length})` : "Unmatched"}
                        </HmsPill>
                      </td>
                      <td className="px-5 py-3 text-right print:hidden">
                        {!canReconcile || isCompleted ? null : matched ? (
                          <button type="button" className={hmsButton.danger} onClick={() => void unmatch(l.id)}>
                            Unmatch<span className="sr-only"> {l.description}</span>
                          </button>
                        ) : (
                          <button type="button" className={hmsButton.quiet} onClick={() => void openMatchDialog(l.id)}>
                            Match<span className="sr-only"> {l.description}</span>
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </HmsCard>

      <HmsCard
        id="bank-rec-outstanding"
        title="Outstanding book items"
        description="Ledger transactions on this account not yet matched to a statement line. That's normal for cheques written but not yet cashed, or deposits the bank hasn't processed."
        icon={ClipboardList}
        meaning="money"
        flush
        className="print:border-0 print:shadow-none"
      >
        {detail.unmatchedJournalLines.length === 0 ? (
          <p className="px-5 py-4 text-sm text-slate-600 sm:px-6">Nothing outstanding.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-sm font-medium text-slate-600">
              <tr>
                <th scope="col" className="px-5 py-3">Date</th>
                <th scope="col" className="px-5 py-3">Memo</th>
                <th scope="col" className="px-5 py-3 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {detail.unmatchedJournalLines.map((jl) => (
                <tr key={jl.id} className="border-b border-slate-100 last:border-0">
                  <td className="whitespace-nowrap px-5 py-3 text-slate-700">{new Date(jl.entryDate).toLocaleDateString()}</td>
                  <td className="px-5 py-3 text-slate-900">{jl.memo}</td>
                  <td className="whitespace-nowrap px-5 py-3 text-right tabular-nums text-slate-900">{(jl.debit || jl.credit).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </HmsCard>

      <Dialog open={addLineOpen} onOpenChange={setAddLineOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Add statement line</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <HmsField id="rec-line-date" label="Date">
              <input id="rec-line-date" type="date" className={hmsInput} value={manualDate} onChange={(e) => setManualDate(e.target.value)} />
            </HmsField>
            <HmsField id="rec-line-description" label="Description">
              <input
                id="rec-line-description"
                className={hmsInput}
                value={manualDescription}
                onChange={(e) => setManualDescription(e.target.value)}
                placeholder="e.g. Bank fee"
              />
            </HmsField>
            <HmsField id="rec-line-amount" label="Amount" hint="Positive for money in, negative for money out.">
              <input
                id="rec-line-amount"
                type="number"
                step="0.01"
                aria-describedby="rec-line-amount-hint"
                className={`${hmsInput} tabular-nums`}
                value={manualAmount}
                onChange={(e) => setManualAmount(e.target.value)}
                placeholder="-25.00"
              />
            </HmsField>
            <HmsField id="rec-line-reference" label="Reference" optional>
              <input id="rec-line-reference" className={hmsInput} value={manualReference} onChange={(e) => setManualReference(e.target.value)} />
            </HmsField>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setAddLineOpen(false)}>
              Cancel
            </Button>
            <Button type="button" disabled={savingLine} onClick={() => void addManualLine()}>
              {savingLine ? "Saving…" : "Add line"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(matchingLineId)} onOpenChange={(open) => !open && setMatchingLineId(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Match statement line</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {matchingLine ? (
              <p className="text-sm text-slate-700">
                {matchingLine.description}: <span className="font-semibold tabular-nums text-slate-900">{matchingLine.amount.toFixed(2)}</span>
              </p>
            ) : null}
            {loadingCandidates ? (
              <p role="status" className="text-sm text-slate-600">
                Loading possible matches…
              </p>
            ) : candidates.length === 0 ? (
              <p className="text-sm text-slate-600">
                No unmatched ledger transactions found nearby. Check the date range, or post the entry first.
              </p>
            ) : (
              <fieldset className="max-h-72 divide-y divide-slate-100 overflow-y-auto rounded-xl border border-slate-200">
                <legend className="sr-only">Ledger transactions to match</legend>
                {candidates.map((c) => (
                  <label
                    key={c.journalEntryLineId}
                    className="flex cursor-pointer items-center justify-between gap-2 px-3 py-2.5 text-sm hover:bg-slate-50"
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-slate-300 accent-emerald-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                        checked={selectedCandidates.has(c.journalEntryLineId)}
                        onChange={() => toggleCandidate(c.journalEntryLineId)}
                      />
                      <span className="min-w-0 truncate text-slate-900">
                        {new Date(c.entryDate).toLocaleDateString()}: {c.memo}
                      </span>
                      {c.exact ? <HmsPill tone="green">Exact match</HmsPill> : null}
                    </span>
                    <span className="shrink-0 tabular-nums text-slate-900">{(c.debit - c.credit).toFixed(2)}</span>
                  </label>
                ))}
              </fieldset>
            )}
            <p
              aria-live="polite"
              className={`flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold tabular-nums ${
                selectedSumsMatch ? "bg-emerald-50 text-emerald-800" : "bg-slate-50 text-slate-700"
              }`}
            >
              {selectedSumsMatch ? <CircleCheck className="h-4 w-4 shrink-0" aria-hidden /> : <CircleAlert className="h-4 w-4 shrink-0" aria-hidden />}
              Selected total {selectedTotal.toFixed(2)}
              {matchingLine ? ` of ${matchingLine.amount.toFixed(2)}` : ""}
              {selectedSumsMatch ? " · Amounts agree" : " · Amounts don't agree yet"}
            </p>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setMatchingLineId(null)}>
              Cancel
            </Button>
            <Button type="button" disabled={busy || selectedCandidates.size === 0 || !selectedSumsMatch} onClick={() => void confirmMatch()}>
              Confirm match
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </HmsPage>
  );
}

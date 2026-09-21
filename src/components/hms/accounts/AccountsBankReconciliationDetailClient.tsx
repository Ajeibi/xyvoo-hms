"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { toastError, toastSuccess } from "@/lib/app-toast";
import type { BankReconciliationDetail, SuggestedMatch } from "@/lib/hms/bank-reconciliation";

function StatBox({ label, value, tone }: { label: string; value: string; tone?: "danger" | "success" }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/60 px-4 py-3">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className={cn("mt-1 text-lg font-semibold tabular-nums", tone === "danger" ? "text-red-600" : tone === "success" ? "text-emerald-700" : "text-slate-900")}>
        {value}
      </p>
    </div>
  );
}

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
    <div className="w-full px-6 py-8 sm:px-8">
      <Link href={`/hms/${slug}/accounts/bank-reconciliation`} className="text-sm text-blue-600 hover:underline">
        ← Bank reconciliation
      </Link>
      <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">{accountLabel}</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Statement period ending {new Date(detail.reconciliation.periodEndDate).toLocaleDateString()}
            {currency ? ` (${currency})` : ""}
          </p>
        </div>
        <span
          className={cn(
            "rounded-full px-3 py-1 text-xs font-semibold",
            isCompleted ? "bg-emerald-100 text-emerald-900" : "bg-amber-100 text-amber-900",
          )}
        >
          {isCompleted ? "Completed" : "In progress"}
        </span>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatBox label="Book balance" value={detail.bookBalance.toFixed(2)} />
        <StatBox label="Cleared book balance" value={detail.clearedBookBalance.toFixed(2)} />
        <StatBox label="Statement balance" value={detail.reconciliation.statementEndingBalance.toFixed(2)} />
        <StatBox
          label={detail.balanced ? "Balanced" : "Difference"}
          value={detail.balanced ? "0.00" : detail.difference.toFixed(2)}
          tone={detail.balanced ? "success" : "danger"}
        />
      </div>

      {canReconcile && !isCompleted ? (
        <div className="mt-6 flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
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
          <Button type="button" variant="outline" disabled={uploading} onClick={() => fileInputRef.current?.click()}>
            <Upload className="h-3.5 w-3.5" /> {uploading ? "Importing…" : "Import statement CSV"}
          </Button>
          <Button type="button" variant="outline" onClick={() => setAddLineOpen(true)}>
            Add line manually
          </Button>
          <Button type="button" className="ml-auto" disabled={busy} onClick={() => void complete()}>
            Complete reconciliation
          </Button>
        </div>
      ) : isCompleted && canReconcile ? (
        <div className="mt-6 flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-sm text-slate-600">
            Completed {detail.reconciliation.completedAt ? new Date(detail.reconciliation.completedAt).toLocaleString() : ""} — final
            difference {detail.reconciliation.finalDifference?.toFixed(2) ?? "0.00"}.
          </p>
          <Button type="button" variant="outline" disabled={busy} onClick={() => void reopen()}>
            Reopen
          </Button>
        </div>
      ) : null}

      <div className="mt-6 overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="border-b bg-slate-50 text-xs font-semibold uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Description</th>
              <th className="px-4 py-3 text-right">Amount</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {detail.lines.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-sm text-slate-400">
                  No statement lines yet — import a CSV or add one manually.
                </td>
              </tr>
            ) : (
              detail.lines.map((l) => {
                const matched = l.matchedJournalEntryLineIds.length > 0;
                return (
                  <tr key={l.id} className="border-b border-slate-100 last:border-0">
                    <td className="px-4 py-2 text-slate-600">{new Date(l.lineDate).toLocaleDateString()}</td>
                    <td className="px-4 py-2">
                      {l.description}
                      {l.reference ? <span className="text-slate-400"> · {l.reference}</span> : null}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-slate-900">{l.amount.toFixed(2)}</td>
                    <td className="px-4 py-2">
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-xs font-medium",
                          matched ? "bg-emerald-100 text-emerald-900" : "bg-slate-100 text-slate-500",
                        )}
                      >
                        {matched ? `Matched (${l.matchedJournalEntryLineIds.length})` : "Unmatched"}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right">
                      {!canReconcile || isCompleted ? null : matched ? (
                        <button type="button" className="text-xs text-red-600 hover:underline" onClick={() => void unmatch(l.id)}>
                          Unmatch
                        </button>
                      ) : (
                        <button type="button" className="text-xs text-blue-600 hover:underline" onClick={() => void openMatchDialog(l.id)}>
                          Match
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">Outstanding book items</h2>
        <p className="mt-1 text-xs text-slate-500">
          Ledger transactions on this account not yet matched to a statement line — normal for checks written but not yet
          cashed, or deposits not yet processed by the bank.
        </p>
        {detail.unmatchedJournalLines.length === 0 ? (
          <p className="mt-3 text-sm text-slate-400">Nothing outstanding.</p>
        ) : (
          <ul className="mt-3 space-y-1 text-sm text-slate-600">
            {detail.unmatchedJournalLines.map((jl) => (
              <li key={jl.id} className="flex items-center justify-between border-b border-slate-100 py-1.5 last:border-0">
                <span>
                  {new Date(jl.entryDate).toLocaleDateString()} — {jl.memo}
                </span>
                <span className="tabular-nums">{(jl.debit || jl.credit).toFixed(2)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Dialog open={addLineOpen} onOpenChange={setAddLineOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Add statement line</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <p className="mb-1 text-xs font-medium text-slate-600">Date</p>
              <Input type="date" value={manualDate} onChange={(e) => setManualDate(e.target.value)} />
            </div>
            <div>
              <p className="mb-1 text-xs font-medium text-slate-600">Description</p>
              <Input value={manualDescription} onChange={(e) => setManualDescription(e.target.value)} placeholder="e.g. Bank fee" />
            </div>
            <div>
              <p className="mb-1 text-xs font-medium text-slate-600">Amount (positive = in, negative = out)</p>
              <Input type="number" step="0.01" value={manualAmount} onChange={(e) => setManualAmount(e.target.value)} placeholder="-25.00" />
            </div>
            <div>
              <p className="mb-1 text-xs font-medium text-slate-600">Reference (optional)</p>
              <Input value={manualReference} onChange={(e) => setManualReference(e.target.value)} />
            </div>
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
              <p className="text-sm text-slate-600">
                {matchingLine.description} — <span className="font-medium tabular-nums">{matchingLine.amount.toFixed(2)}</span>
              </p>
            ) : null}
            {loadingCandidates ? (
              <p className="text-sm text-slate-400">Loading candidates…</p>
            ) : candidates.length === 0 ? (
              <p className="text-sm text-slate-400">No unmatched ledger transactions found nearby — check the date range or post the entry first.</p>
            ) : (
              <div className="max-h-72 space-y-1 overflow-y-auto rounded-lg border border-slate-200 p-2">
                {candidates.map((c) => (
                  <label
                    key={c.journalEntryLineId}
                    className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-slate-50"
                  >
                    <span className="flex items-center gap-2 min-w-0">
                      <input
                        type="checkbox"
                        checked={selectedCandidates.has(c.journalEntryLineId)}
                        onChange={() => toggleCandidate(c.journalEntryLineId)}
                      />
                      <span className="min-w-0 truncate">
                        {new Date(c.entryDate).toLocaleDateString()} — {c.memo}
                        {c.exact ? <span className="ml-1.5 text-xs text-emerald-700">(exact match)</span> : null}
                      </span>
                    </span>
                    <span className="shrink-0 tabular-nums text-slate-700">{(c.debit - c.credit).toFixed(2)}</span>
                  </label>
                ))}
              </div>
            )}
            <p className={cn("text-sm font-medium tabular-nums", selectedSumsMatch ? "text-emerald-700" : "text-slate-500")}>
              Selected total: {selectedTotal.toFixed(2)} {matchingLine ? `(target ${matchingLine.amount.toFixed(2)})` : ""}
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
    </div>
  );
}

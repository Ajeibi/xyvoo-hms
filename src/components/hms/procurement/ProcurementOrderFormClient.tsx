"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toastError, toastSuccess } from "@/lib/app-toast";
import type { SourceableRequisitionLine, VendorWithCategory } from "@/lib/hms/procurement-types";

const DEPARTMENT_OPTIONS = ["Kitchen", "Bar", "Housekeeping", "Front Desk", "Engineering", "Procurement", "Other"] as const;

type ManualLine = { key: string; description: string; quantity: string; unitCost: string };

function emptyManualLine(): ManualLine {
  return { key: crypto.randomUUID(), description: "", quantity: "1", unitCost: "0" };
}

export function ProcurementOrderFormClient({
  slug,
  vendors,
  sourceableLines,
  preselectedLineIds,
  defaultCurrency,
}: {
  slug: string;
  vendors: VendorWithCategory[];
  sourceableLines: SourceableRequisitionLine[];
  preselectedLineIds: string[];
  defaultCurrency: string;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<"requisition" | "manual">(preselectedLineIds.length ? "requisition" : sourceableLines.length ? "requisition" : "manual");
  const [vendorId, setVendorId] = useState("");
  const [department, setDepartment] = useState<string>("");
  const [customDepartment, setCustomDepartment] = useState("");
  const [currency, setCurrency] = useState(defaultCurrency);
  const [fxRate, setFxRate] = useState("1");
  const [tax, setTax] = useState("0");
  const [expectedDeliveryDate, setExpectedDeliveryDate] = useState("");
  const [notes, setNotes] = useState("");
  const [manualReason, setManualReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [selectedLineIds, setSelectedLineIds] = useState<Set<string>>(new Set(preselectedLineIds));
  const [qtyByLine, setQtyByLine] = useState<Record<string, string>>(() => {
    const draft: Record<string, string> = {};
    for (const l of sourceableLines) draft[l.requisitionLineId] = String(l.qtyRemaining);
    return draft;
  });
  const [costByLine, setCostByLine] = useState<Record<string, string>>(() => {
    const draft: Record<string, string> = {};
    for (const l of sourceableLines) draft[l.requisitionLineId] = String(l.unitCost);
    return draft;
  });

  const [manualLines, setManualLines] = useState<ManualLine[]>([emptyManualLine()]);

  // Pre-fill sourced lines with the vendor's agreed price catalog whenever a vendor is picked.
  useEffect(() => {
    if (!vendorId || mode !== "requisition" || !sourceableLines.length) return;
    let cancelled = false;
    fetch(`/api/hotel/procurement/vendors/${vendorId}/price-catalog?slug=${encodeURIComponent(slug)}`)
      .then((res) => (res.ok ? res.json() : { entries: [] }))
      .then((data: { entries?: { item_id: string; unit_price: number }[] }) => {
        if (cancelled || !data.entries?.length) return;
        const priceByItemId = new Map(data.entries.map((e) => [e.item_id, e.unit_price]));
        setCostByLine((prev) => {
          const next = { ...prev };
          for (const line of sourceableLines) {
            const price = priceByItemId.get(line.itemId);
            if (price !== undefined) next[line.requisitionLineId] = String(price);
          }
          return next;
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [vendorId, mode, slug, sourceableLines]);

  const toggleLine = (id: string) => {
    setSelectedLineIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectedLines = useMemo(() => sourceableLines.filter((l) => selectedLineIds.has(l.requisitionLineId)), [sourceableLines, selectedLineIds]);

  const estimatedTotal = useMemo(() => {
    if (mode === "requisition") {
      return selectedLines.reduce((sum, l) => sum + Number(qtyByLine[l.requisitionLineId] || 0) * Number(costByLine[l.requisitionLineId] || 0), 0);
    }
    return manualLines.reduce((sum, l) => sum + Number(l.quantity || 0) * Number(l.unitCost || 0), 0) + Number(tax || 0);
  }, [mode, selectedLines, qtyByLine, costByLine, manualLines, tax]);

  const resolvedDepartment = department === "Other" ? customDepartment.trim() : department;
  const canSubmit =
    vendorId.trim().length > 0 &&
    resolvedDepartment.length > 0 &&
    (mode === "requisition"
      ? selectedLines.length > 0
      : manualReason.trim().length > 0 && manualLines.some((l) => l.description.trim() && Number(l.quantity) > 0));

  const submit = async () => {
    setSubmitting(true);
    try {
      const lines =
        mode === "requisition"
          ? selectedLines.map((l) => ({
              requisitionLineId: l.requisitionLineId,
              itemId: l.itemId,
              description: `${l.itemName} (${l.itemSku})`,
              quantity: Number(qtyByLine[l.requisitionLineId] || 0),
              unitCost: Number(costByLine[l.requisitionLineId] || 0),
            }))
          : manualLines
              .filter((l) => l.description.trim() && Number(l.quantity) > 0)
              .map((l) => ({ description: l.description.trim(), quantity: Number(l.quantity), unitCost: Number(l.unitCost) || 0 }));

      const res = await fetch("/api/hotel/procurement/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug,
          vendorId,
          department: resolvedDepartment,
          currency,
          fxRate: Number(fxRate) || 1,
          tax: Number(tax) || 0,
          expectedDeliveryDate: expectedDeliveryDate || undefined,
          notes: notes.trim() || undefined,
          isManual: mode === "manual",
          manualReason: mode === "manual" ? manualReason.trim() : undefined,
          lines,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toastError("Could not create purchase order", data.error ?? "Try again.");
        return;
      }
      toastSuccess(`${data.order?.po_number ?? "Purchase order"} created`);
      router.push(`/hms/${slug}/procurement/orders/${data.order?.id}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mt-6 max-w-3xl space-y-5">
      <div className="flex gap-1">
        <button
          type="button"
          onClick={() => setMode("requisition")}
          className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
            mode === "requisition" ? "border-blue-600 bg-blue-600 text-white" : "border-slate-200 bg-white text-slate-600"
          }`}
        >
          From requisitions
        </button>
        <button
          type="button"
          onClick={() => setMode("manual")}
          className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
            mode === "manual" ? "border-blue-600 bg-blue-600 text-white" : "border-slate-200 bg-white text-slate-600"
          }`}
        >
          Manual / ad-hoc
        </button>
      </div>

      <div className="grid gap-3 rounded-xl border border-slate-200 bg-white p-5 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Vendor</label>
          <Select value={vendorId} onValueChange={setVendorId}>
            <SelectTrigger>
              <SelectValue placeholder="Select vendor" />
            </SelectTrigger>
            <SelectContent>
              {vendors.map((v) => (
                <SelectItem key={v.id} value={v.id}>
                  {v.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Cost-centre department</label>
          <Select value={department} onValueChange={setDepartment}>
            <SelectTrigger>
              <SelectValue placeholder="Select department" />
            </SelectTrigger>
            <SelectContent>
              {DEPARTMENT_OPTIONS.map((d) => (
                <SelectItem key={d} value={d}>
                  {d}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {department === "Other" ? (
            <Input className="mt-2" value={customDepartment} onChange={(e) => setCustomDepartment(e.target.value)} placeholder="Department name" />
          ) : null}
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Currency</label>
          <Input value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} maxLength={6} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">
            FX rate {currency !== defaultCurrency ? `(1 ${currency} → ${defaultCurrency})` : `(vs. ${defaultCurrency})`}
          </label>
          <Input type="number" min="0" step="any" value={fxRate} onChange={(e) => setFxRate(e.target.value)} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Tax</label>
          <Input type="number" min="0" step="any" value={tax} onChange={(e) => setTax(e.target.value)} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Expected delivery date</label>
          <Input type="date" value={expectedDeliveryDate} onChange={(e) => setExpectedDeliveryDate(e.target.value)} />
        </div>
        <div className="sm:col-span-2">
          <label className="mb-1 block text-xs font-medium text-slate-600">Notes (optional)</label>
          <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        {mode === "manual" ? (
          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs font-medium text-slate-600">Reason for a manual PO (required)</label>
            <Input value={manualReason} onChange={(e) => setManualReason(e.target.value)} placeholder="e.g. Planned bulk buy, no upstream requisition" />
          </div>
        ) : null}
      </div>

      {mode === "requisition" ? (
        <div className="rounded-xl border border-slate-200 bg-white">
          <div className="border-b border-slate-100 px-5 py-3">
            <h2 className="text-sm font-semibold text-slate-900">Requisition lines to source</h2>
          </div>
          {sourceableLines.length === 0 ? (
            <p className="px-5 py-6 text-sm text-slate-500">Nothing approved is waiting on Procurement right now.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {sourceableLines.map((l) => (
                <li key={l.requisitionLineId} className="grid grid-cols-12 items-center gap-2 px-5 py-3">
                  <div className="col-span-1">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-slate-300"
                      checked={selectedLineIds.has(l.requisitionLineId)}
                      onChange={() => toggleLine(l.requisitionLineId)}
                    />
                  </div>
                  <div className="col-span-5 min-w-0">
                    <p className="truncate text-sm text-slate-800">{l.itemName}</p>
                    <p className="text-xs text-slate-400">
                      {l.requisitionNumber} · {l.requestingDepartment} · remaining {l.qtyRemaining} {l.unitOfMeasure}
                    </p>
                  </div>
                  <div className="col-span-3">
                    <Input
                      type="number"
                      min="0"
                      step="any"
                      value={qtyByLine[l.requisitionLineId] ?? ""}
                      onChange={(e) => setQtyByLine((prev) => ({ ...prev, [l.requisitionLineId]: e.target.value }))}
                      placeholder="Qty"
                    />
                  </div>
                  <div className="col-span-3">
                    <Input
                      type="number"
                      min="0"
                      step="any"
                      value={costByLine[l.requisitionLineId] ?? ""}
                      onChange={(e) => setCostByLine((prev) => ({ ...prev, [l.requisitionLineId]: e.target.value }))}
                      placeholder="Unit cost"
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
            <h2 className="text-sm font-semibold text-slate-900">Line items</h2>
            <Button type="button" variant="outline" size="sm" className="rounded-lg" onClick={() => setManualLines((prev) => [...prev, emptyManualLine()])}>
              <Plus className="h-3.5 w-3.5" /> Add line
            </Button>
          </div>
          <div className="space-y-2 p-5">
            {manualLines.map((line) => (
              <div key={line.key} className="grid grid-cols-12 items-center gap-2 rounded-lg border border-slate-200 p-2">
                <div className="col-span-6">
                  <Input
                    value={line.description}
                    onChange={(e) => setManualLines((prev) => prev.map((l) => (l.key === line.key ? { ...l, description: e.target.value } : l)))}
                    placeholder="Description"
                  />
                </div>
                <div className="col-span-2">
                  <Input
                    type="number"
                    min="0"
                    step="any"
                    value={line.quantity}
                    onChange={(e) => setManualLines((prev) => prev.map((l) => (l.key === line.key ? { ...l, quantity: e.target.value } : l)))}
                    placeholder="Qty"
                  />
                </div>
                <div className="col-span-3">
                  <Input
                    type="number"
                    min="0"
                    step="any"
                    value={line.unitCost}
                    onChange={(e) => setManualLines((prev) => prev.map((l) => (l.key === line.key ? { ...l, unitCost: e.target.value } : l)))}
                    placeholder="Unit cost"
                  />
                </div>
                <div className="col-span-1 flex justify-end">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => setManualLines((prev) => (prev.length > 1 ? prev.filter((l) => l.key !== line.key) : prev))}
                    disabled={manualLines.length === 1}
                  >
                    <Trash2 className="h-4 w-4 text-slate-400" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-5 py-4">
        <p className="text-sm text-slate-500">Estimated total</p>
        <p className="text-lg font-semibold text-slate-900">
          {estimatedTotal.toLocaleString(undefined, { maximumFractionDigits: 2 })} {currency}
        </p>
      </div>

      <div className="flex justify-end gap-2">
        <Button type="button" disabled={!canSubmit || submitting} onClick={() => void submit()} className="rounded-lg">
          {submitting ? "Creating…" : "Create purchase order"}
        </Button>
      </div>
    </div>
  );
}

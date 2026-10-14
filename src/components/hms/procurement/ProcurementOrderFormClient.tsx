"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ClipboardList, Plus, ShoppingCart, Trash2, Truck } from "lucide-react";
import { HmsCard, HmsEmptyState, HmsField, hmsButton, hmsInput } from "@/components/hms/hms-ui";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toastError, toastSuccess } from "@/lib/app-toast";
import type { SourceableRequisitionLine, VendorWithCategory } from "@/lib/hms/procurement-types";

const DEPARTMENT_OPTIONS = ["Kitchen", "Bar", "Housekeeping", "Front Desk", "Engineering", "Procurement", "Other"] as const;

type ManualLine = { key: string; description: string; quantity: string; unitCost: string; itemId?: string };

function emptyManualLine(): ManualLine {
  return { key: crypto.randomUUID(), description: "", quantity: "1", unitCost: "0" };
}

export type PrefillManualLine = { itemId: string; description: string; quantity: number; unitCost: number };

export function ProcurementOrderFormClient({
  slug,
  vendors,
  sourceableLines,
  preselectedLineIds,
  defaultCurrency,
  prefillManualLine,
}: {
  slug: string;
  vendors: VendorWithCategory[];
  sourceableLines: SourceableRequisitionLine[];
  preselectedLineIds: string[];
  defaultCurrency: string;
  prefillManualLine?: PrefillManualLine;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<"requisition" | "manual">(
    prefillManualLine ? "manual" : preselectedLineIds.length ? "requisition" : sourceableLines.length ? "requisition" : "manual",
  );
  const [vendorId, setVendorId] = useState("");
  const [department, setDepartment] = useState<string>("");
  const [customDepartment, setCustomDepartment] = useState("");
  const [currency, setCurrency] = useState(defaultCurrency);
  const [fxRate, setFxRate] = useState("1");
  const [tax, setTax] = useState("0");
  const [expectedDeliveryDate, setExpectedDeliveryDate] = useState("");
  const [notes, setNotes] = useState("");
  const [manualReason, setManualReason] = useState(
    prefillManualLine ? "Restocking — item at or below its reorder point" : "",
  );
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

  const [manualLines, setManualLines] = useState<ManualLine[]>(() =>
    prefillManualLine
      ? [
          {
            key: crypto.randomUUID(),
            description: prefillManualLine.description,
            quantity: String(prefillManualLine.quantity),
            unitCost: String(prefillManualLine.unitCost),
            itemId: prefillManualLine.itemId,
          },
        ]
      : [emptyManualLine()],
  );

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
              .map((l) => ({
                description: l.description.trim(),
                quantity: Number(l.quantity),
                unitCost: Number(l.unitCost) || 0,
                itemId: l.itemId,
              }));

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

  const missing: string[] = [];
  if (!vendorId.trim()) missing.push("Choose a vendor.");
  if (!resolvedDepartment) missing.push(department === "Other" ? "Type the department name." : "Choose a cost-centre department.");
  if (mode === "requisition" && selectedLines.length === 0) missing.push("Tick at least one requisition line to source.");
  if (mode === "manual" && !manualReason.trim()) missing.push("Give a reason for the manual PO.");
  if (mode === "manual" && !manualLines.some((l) => l.description.trim() && Number(l.quantity) > 0)) missing.push("Add at least one line with a description and quantity.");

  const selectTrigger = "h-11 rounded-xl border-slate-300";
  const modeChip = (on: boolean) =>
    `inline-flex items-center rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
      on ? "border-teal-600 bg-teal-50 text-teal-900" : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
    }`;

  return (
    <div className="max-w-3xl space-y-6">
      <div role="group" aria-label="How to raise this order" className="flex flex-wrap gap-2">
        <button type="button" aria-pressed={mode === "requisition"} onClick={() => setMode("requisition")} className={modeChip(mode === "requisition")}>
          From requisitions
        </button>
        <button type="button" aria-pressed={mode === "manual"} onClick={() => setMode("manual")} className={modeChip(mode === "manual")}>
          Manual / ad-hoc
        </button>
      </div>

      <HmsCard id="po-details" title="Order details" description="Who you're buying from and which department pays." icon={Truck} meaning="stock">
        <div className="grid gap-4 sm:grid-cols-2">
          <HmsField id="po-vendor" label="Vendor">
            <Select value={vendorId} onValueChange={setVendorId}>
              <SelectTrigger id="po-vendor" aria-required className={selectTrigger}>
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
          </HmsField>
          <div className="space-y-3">
            <HmsField id="po-department" label="Cost-centre department">
              <Select value={department} onValueChange={setDepartment}>
                <SelectTrigger id="po-department" aria-required className={selectTrigger}>
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
            </HmsField>
            {department === "Other" ? (
              <HmsField id="po-custom-department" label="Department name">
                <input id="po-custom-department" aria-required className={hmsInput} value={customDepartment} onChange={(e) => setCustomDepartment(e.target.value)} />
              </HmsField>
            ) : null}
          </div>
          <HmsField id="po-currency" label="Currency" hint="Three-letter code, such as NGN or USD.">
            <input
              id="po-currency"
              aria-describedby="po-currency-hint"
              className={hmsInput}
              value={currency}
              onChange={(e) => setCurrency(e.target.value.toUpperCase())}
              maxLength={6}
            />
          </HmsField>
          <HmsField
            id="po-fx-rate"
            label="Exchange rate"
            hint={currency !== defaultCurrency ? `How many ${defaultCurrency} make 1 ${currency}.` : `Leave at 1 when paying in ${defaultCurrency}.`}
          >
            <input
              id="po-fx-rate"
              type="number"
              min="0"
              step="any"
              inputMode="decimal"
              aria-describedby="po-fx-rate-hint"
              className={`${hmsInput} tabular-nums`}
              value={fxRate}
              onChange={(e) => setFxRate(e.target.value)}
            />
          </HmsField>
          <HmsField id="po-tax" label="Tax">
            <input
              id="po-tax"
              type="number"
              min="0"
              step="any"
              inputMode="decimal"
              className={`${hmsInput} tabular-nums`}
              value={tax}
              onChange={(e) => setTax(e.target.value)}
            />
          </HmsField>
          <HmsField id="po-expected-delivery" label="Expected delivery date" optional>
            <input id="po-expected-delivery" type="date" className={hmsInput} value={expectedDeliveryDate} onChange={(e) => setExpectedDeliveryDate(e.target.value)} />
          </HmsField>
          <div className="sm:col-span-2">
            <HmsField id="po-notes" label="Notes" optional>
              <input id="po-notes" className={hmsInput} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </HmsField>
          </div>
          {mode === "manual" ? (
            <div className="sm:col-span-2">
              <HmsField id="po-manual-reason" label="Reason for a manual PO" hint="Required, as there's no approved requisition behind this order.">
                <input
                  id="po-manual-reason"
                  aria-required
                  aria-describedby="po-manual-reason-hint"
                  className={hmsInput}
                  value={manualReason}
                  onChange={(e) => setManualReason(e.target.value)}
                  placeholder="e.g. Planned bulk buy, no upstream requisition"
                />
              </HmsField>
            </div>
          ) : null}
        </div>
      </HmsCard>

      {mode === "requisition" ? (
        <HmsCard
          id="po-requisition-lines"
          title="Requisition lines to source"
          description="Tick the lines this order covers, then check the quantity and unit cost."
          icon={ClipboardList}
          meaning="team"
          flush
        >
          {sourceableLines.length === 0 ? (
            <HmsEmptyState bare art="page" meaning="team" title="Nothing to source" description="Nothing approved is waiting on Procurement right now." />
          ) : (
            <ul className="divide-y divide-slate-100">
              {sourceableLines.map((l) => {
                const id = l.requisitionLineId;
                return (
                  <li key={id} className="grid grid-cols-1 items-center gap-3 px-5 py-4 sm:grid-cols-12 sm:px-6">
                    <div className="flex min-w-0 items-start gap-3 sm:col-span-6">
                      <input
                        id={`po-line-${id}`}
                        type="checkbox"
                        className="mt-0.5 h-5 w-5 shrink-0 rounded border-slate-300 text-teal-700 focus-visible:ring-2 focus-visible:ring-blue-500"
                        checked={selectedLineIds.has(id)}
                        onChange={() => toggleLine(id)}
                      />
                      <label htmlFor={`po-line-${id}`} className="min-w-0 cursor-pointer">
                        <span className="block truncate text-sm font-medium text-slate-900">{l.itemName}</span>
                        <span className="block text-sm text-slate-600">
                          {l.requisitionNumber} · {l.requestingDepartment} · {l.qtyRemaining} {l.unitOfMeasure} remaining
                        </span>
                      </label>
                    </div>
                    <div className="sm:col-span-3">
                      <label htmlFor={`po-line-qty-${id}`} className="mb-1 block text-xs font-medium text-slate-700">
                        Quantity
                      </label>
                      <input
                        id={`po-line-qty-${id}`}
                        type="number"
                        min="0"
                        step="any"
                        inputMode="decimal"
                        className={`${hmsInput} tabular-nums`}
                        value={qtyByLine[id] ?? ""}
                        onChange={(e) => setQtyByLine((prev) => ({ ...prev, [id]: e.target.value }))}
                      />
                    </div>
                    <div className="sm:col-span-3">
                      <label htmlFor={`po-line-cost-${id}`} className="mb-1 block text-xs font-medium text-slate-700">
                        Unit cost
                      </label>
                      <input
                        id={`po-line-cost-${id}`}
                        type="number"
                        min="0"
                        step="any"
                        inputMode="decimal"
                        className={`${hmsInput} tabular-nums`}
                        value={costByLine[id] ?? ""}
                        onChange={(e) => setCostByLine((prev) => ({ ...prev, [id]: e.target.value }))}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </HmsCard>
      ) : (
        <HmsCard
          id="po-manual-lines"
          title="Line items"
          description="What you're ordering, how many, and the price per unit."
          icon={ShoppingCart}
          meaning="stock"
          actions={
            <button type="button" className={hmsButton.secondary} onClick={() => setManualLines((prev) => [...prev, emptyManualLine()])}>
              <Plus className="h-4 w-4" aria-hidden /> Add line
            </button>
          }
        >
          <ul className="space-y-3">
            {manualLines.map((line, index) => (
              <li key={line.key} className="grid grid-cols-1 items-end gap-3 rounded-xl border border-slate-200 p-3 sm:grid-cols-12">
                <div className="sm:col-span-6">
                  <label htmlFor={`po-manual-desc-${line.key}`} className="mb-1 block text-xs font-medium text-slate-700">
                    Description
                  </label>
                  <input
                    id={`po-manual-desc-${line.key}`}
                    className={hmsInput}
                    value={line.description}
                    onChange={(e) => setManualLines((prev) => prev.map((l) => (l.key === line.key ? { ...l, description: e.target.value } : l)))}
                  />
                </div>
                <div className="sm:col-span-2">
                  <label htmlFor={`po-manual-qty-${line.key}`} className="mb-1 block text-xs font-medium text-slate-700">
                    Quantity
                  </label>
                  <input
                    id={`po-manual-qty-${line.key}`}
                    type="number"
                    min="0"
                    step="any"
                    inputMode="decimal"
                    className={`${hmsInput} tabular-nums`}
                    value={line.quantity}
                    onChange={(e) => setManualLines((prev) => prev.map((l) => (l.key === line.key ? { ...l, quantity: e.target.value } : l)))}
                  />
                </div>
                <div className="sm:col-span-3">
                  <label htmlFor={`po-manual-cost-${line.key}`} className="mb-1 block text-xs font-medium text-slate-700">
                    Unit cost
                  </label>
                  <input
                    id={`po-manual-cost-${line.key}`}
                    type="number"
                    min="0"
                    step="any"
                    inputMode="decimal"
                    className={`${hmsInput} tabular-nums`}
                    value={line.unitCost}
                    onChange={(e) => setManualLines((prev) => prev.map((l) => (l.key === line.key ? { ...l, unitCost: e.target.value } : l)))}
                  />
                </div>
                <div className="flex justify-end sm:col-span-1">
                  <button
                    type="button"
                    className="inline-flex h-11 w-11 items-center justify-center rounded-xl text-slate-600 hover:bg-rose-50 hover:text-rose-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-40"
                    onClick={() => setManualLines((prev) => (prev.length > 1 ? prev.filter((l) => l.key !== line.key) : prev))}
                    disabled={manualLines.length === 1}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden />
                    <span className="sr-only">Remove line {index + 1}</span>
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </HmsCard>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-emerald-50 px-5 py-4">
        <p className="text-sm font-medium text-slate-700">Estimated total</p>
        <p className="font-heading text-xl font-bold tabular-nums text-slate-900">
          {estimatedTotal.toLocaleString(undefined, { maximumFractionDigits: 2 })} {currency}
        </p>
      </div>

      <div className="flex flex-col items-end gap-2">
        {!canSubmit && missing.length ? (
          <ul id="po-form-missing" className="space-y-0.5 text-right text-sm text-slate-700">
            {missing.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        ) : null}
        <button
          type="button"
          className={hmsButton.primary}
          aria-describedby={!canSubmit && missing.length ? "po-form-missing" : undefined}
          disabled={!canSubmit || submitting}
          onClick={() => void submit()}
        >
          {submitting ? "Creating…" : "Create purchase order"}
        </button>
      </div>
    </div>
  );
}

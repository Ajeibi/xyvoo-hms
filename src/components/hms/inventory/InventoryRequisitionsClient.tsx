"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ClipboardList, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { toastError, toastSuccess } from "@/lib/app-toast";
import { InventoryItemPicker } from "@/components/hms/inventory/InventoryItemPicker";
import { HmsCard, HmsEmptyState, HmsField, HmsPill, hmsButton, hmsInput } from "@/components/hms/hms-ui";
import { HmsFilterChips, HmsSectionIntro } from "@/components/hms/hms-ui-client";
import type {
  InventoryItemRow,
  InventoryLocationRow,
  InventoryRequisitionStatus,
  InventoryRequisitionWithLines,
} from "@/lib/hms/inventory-types";

const DEPARTMENT_OPTIONS = ["Kitchen", "Bar", "Housekeeping", "Front Desk", "Engineering", "Other"] as const;

const STATUS_TABS: { key: "all" | InventoryRequisitionStatus; label: string }[] = [
  { key: "all", label: "All" },
  { key: "pending", label: "Pending" },
  { key: "approved", label: "Approved" },
  { key: "partially_issued", label: "Partially issued" },
  { key: "issued", label: "Issued" },
  { key: "rejected", label: "Rejected" },
  { key: "cancelled", label: "Cancelled" },
];

const STATUS_TONE: Record<InventoryRequisitionStatus, "slate" | "green" | "amber" | "red" | "blue"> = {
  pending: "amber",
  approved: "blue",
  partially_issued: "blue",
  issued: "green",
  rejected: "red",
  cancelled: "slate",
};

const STATUS_RAIL: Record<InventoryRequisitionStatus, string> = {
  pending: "bg-amber-500",
  approved: "bg-blue-600",
  partially_issued: "bg-blue-400",
  issued: "bg-emerald-600",
  rejected: "bg-red-600",
  cancelled: "bg-slate-400",
};

const focusRing = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500";
const smallButton = "px-3 py-1.5";

const STATUS_LABEL: Record<InventoryRequisitionStatus, string> = {
  pending: "Pending",
  approved: "Approved",
  partially_issued: "Partially issued",
  issued: "Issued",
  rejected: "Rejected",
  cancelled: "Cancelled",
};

type DraftLine = {
  key: string;
  itemId: string;
  qty: string;
};

function emptyLine(): DraftLine {
  return { key: crypto.randomUUID(), itemId: "", qty: "1" };
}

function formatGroupLabel(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

/** Consecutive same-day requisitions grouped under one date header — input is already sorted newest-first. */
function groupByDate(list: InventoryRequisitionWithLines[]) {
  const groups: { label: string; rows: InventoryRequisitionWithLines[] }[] = [];
  for (const r of list) {
    const label = formatGroupLabel(r.created_at);
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.rows.push(r);
    else groups.push({ label, rows: [r] });
  }
  return groups;
}

function StatusBadge({ status }: { status: InventoryRequisitionStatus }) {
  return <HmsPill tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</HmsPill>;
}

export function InventoryRequisitionsClient({
  slug,
  requisitions,
  locations,
  items: initialItems,
  canCreateItem = false,
}: {
  slug: string;
  requisitions: InventoryRequisitionWithLines[];
  locations: InventoryLocationRow[];
  items: InventoryItemRow[];
  canCreateItem?: boolean;
}) {
  const router = useRouter();
  const [items, setItems] = useState(initialItems);
  const [statusFilter, setStatusFilter] = useState<"all" | InventoryRequisitionStatus>("all");
  const [newOpen, setNewOpen] = useState(false);
  const [issueTarget, setIssueTarget] = useState<InventoryRequisitionWithLines | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const byStatus = statusFilter === "all" ? requisitions : requisitions.filter((r) => r.status === statusFilter);
    const term = search.trim().toLowerCase();
    if (!term) return byStatus;
    return byStatus.filter(
      (r) =>
        r.requisition_number.toLowerCase().includes(term) ||
        r.requesting_department.toLowerCase().includes(term) ||
        r.from_location_name.toLowerCase().includes(term) ||
        r.lines.some((l) => l.item_name.toLowerCase().includes(term) || l.item_sku.toLowerCase().includes(term)),
    );
  }, [requisitions, statusFilter, search]);

  const groupedRows = useMemo(() => groupByDate(filtered), [filtered]);

  const statusCounts = useMemo(() => {
    const counts: Record<"all" | InventoryRequisitionStatus, number> = {
      all: requisitions.length,
      pending: 0,
      approved: 0,
      partially_issued: 0,
      issued: 0,
      rejected: 0,
      cancelled: 0,
    };
    for (const r of requisitions) counts[r.status]++;
    return counts;
  }, [requisitions]);

  const patchAction = async (id: string, action: "approve" | "reject" | "cancel", successMsg: string) => {
    setBusyId(id);
    try {
      const res = await fetch(`/api/hotel/inventory/requisitions/${id}/${action}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toastError("Action failed", data.error ?? "Try again.");
        return;
      }
      toastSuccess(successMsg);
      router.refresh();
    } finally {
      setBusyId(null);
    }
  };

  const cannotRequest = locations.length === 0 || items.length === 0;
  const newButton = (
    <button type="button" className={`${hmsButton.primary} ${focusRing}`} onClick={() => setNewOpen(true)} disabled={cannotRequest}>
      <Plus className="h-4 w-4" aria-hidden />
      New requisition
    </button>
  );

  return (
    <div className="space-y-6">
      <HmsSectionIntro
        id="inventory-requisitions"
        title="Stock requests from departments"
        meaning="team"
        art="page"
        points={[
          "A department asks for stock from a store, such as the kitchen asking the main store.",
          "Each request is approved first, then issued.",
          "Stock only leaves the store when it is issued, not when it is requested.",
        ]}
      />

      <HmsCard
        id="inventory-requisition-list"
        title="Requisitions"
        description="Open a request to see its items, approve it or issue the stock."
        icon={ClipboardList}
        meaning="team"
        flush
        actions={newButton}
      >
        <div className="space-y-4 border-b border-slate-100 px-5 py-4 sm:px-6">
          <div className="sm:max-w-sm">
            <label htmlFor="inventory-requisitions-search" className="mb-1 block text-sm font-medium text-slate-800">
              Search requisitions
            </label>
            <input
              id="inventory-requisitions-search"
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Requisition number, department or item"
              className={hmsInput}
            />
          </div>
          <HmsFilterChips
            label="Filter by status"
            meaning="team"
            value={statusFilter}
            onChange={setStatusFilter}
            options={STATUS_TABS.map((tab) => ({ value: tab.key, label: tab.label, count: statusCounts[tab.key] }))}
          />
        </div>

        {groupedRows.length === 0 ? (
          requisitions.length === 0 ? (
            <HmsEmptyState
              bare
              art="page"
              meaning="team"
              title="No requisitions yet"
              description={
                cannotRequest
                  ? "Add a store location and at least one item first, then departments can request stock."
                  : "When a department needs stock from a store, raise a requisition here."
              }
              action={cannotRequest ? undefined : newButton}
            />
          ) : (
            <p role="status" className="px-6 py-10 text-center text-sm text-slate-600">
              No requisitions match this search or status.
            </p>
          )
        ) : (
          <div className="space-y-5 px-5 py-5 sm:px-6">
            {groupedRows.map((group) => (
              <section key={group.label} aria-label={`Requisitions on ${group.label}`}>
                <h3 className="mb-2 text-sm font-semibold text-slate-700">{group.label}</h3>
                <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                  <Accordion type="multiple">
                    {group.rows.map((r) => {
                      const remainingTotal = r.lines.reduce((sum, l) => sum + (l.qty_requested - l.qty_issued), 0);
                      return (
                        <AccordionItem key={r.id} value={r.id} className="relative border-slate-100">
                          <span className={`absolute inset-y-0 left-0 w-1 ${STATUS_RAIL[r.status]}`} aria-hidden />
                          <AccordionTrigger className="items-center rounded-none border-none py-3 pl-5 pr-4 hover:bg-slate-50 hover:no-underline">
                            <span className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-2 pr-2 text-left">
                              <span className="min-w-0">
                                <span className="block text-sm font-semibold tabular-nums text-slate-900">
                                  {r.requisition_number}
                                </span>
                                <span className="mt-0.5 block text-sm font-normal text-slate-600">
                                  <span className="font-medium text-slate-800">{r.requesting_department}</span> · from{" "}
                                  {r.from_location_name} · {formatTime(r.created_at)}
                                </span>
                              </span>
                              <StatusBadge status={r.status} />
                            </span>
                          </AccordionTrigger>
                          <AccordionContent className="bg-slate-50">
                            <div className="space-y-3 pl-5 pr-4 pt-1">
                              <ul className="divide-y divide-slate-200">
                                {r.lines.map((l) => (
                                  <li key={l.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                                    <span className="min-w-0 truncate text-slate-900">
                                      {l.item_name} <span className="text-xs font-normal text-slate-600">{l.item_sku}</span>
                                    </span>
                                    <span className="shrink-0 tabular-nums text-slate-700">
                                      {l.qty_issued} of {l.qty_requested} {l.unit_of_measure} issued
                                    </span>
                                  </li>
                                ))}
                              </ul>
                              {r.notes ? <p className="text-sm text-slate-700">Note: {r.notes}</p> : null}

                              <div className="flex flex-wrap gap-2 pb-1">
                                {r.status === "pending" ? (
                                  <>
                                    <button
                                      type="button"
                                      className={`${hmsButton.primary} ${smallButton} ${focusRing}`}
                                      disabled={busyId === r.id}
                                      onClick={() => void patchAction(r.id, "approve", `${r.requisition_number} approved`)}
                                    >
                                      Approve
                                    </button>
                                    <button
                                      type="button"
                                      className={`${hmsButton.secondary} ${smallButton} text-red-700 ${focusRing}`}
                                      disabled={busyId === r.id}
                                      onClick={() => void patchAction(r.id, "reject", `${r.requisition_number} rejected`)}
                                    >
                                      Reject
                                    </button>
                                    <button
                                      type="button"
                                      className={`${hmsButton.secondary} ${smallButton} ${focusRing}`}
                                      disabled={busyId === r.id}
                                      onClick={() => void patchAction(r.id, "cancel", `${r.requisition_number} cancelled`)}
                                    >
                                      Cancel request
                                    </button>
                                  </>
                                ) : null}
                                {r.status === "approved" || r.status === "partially_issued" ? (
                                  <>
                                    <button
                                      type="button"
                                      className={`${hmsButton.primary} ${smallButton} ${focusRing}`}
                                      disabled={busyId === r.id || remainingTotal <= 0}
                                      onClick={() => setIssueTarget(r)}
                                    >
                                      Issue stock
                                    </button>
                                    {r.status === "approved" ? (
                                      <button
                                        type="button"
                                        className={`${hmsButton.secondary} ${smallButton} ${focusRing}`}
                                        disabled={busyId === r.id}
                                        onClick={() => void patchAction(r.id, "cancel", `${r.requisition_number} cancelled`)}
                                      >
                                        Cancel request
                                      </button>
                                    ) : null}
                                  </>
                                ) : null}
                              </div>
                            </div>
                          </AccordionContent>
                        </AccordionItem>
                      );
                    })}
                  </Accordion>
                </div>
              </section>
            ))}
          </div>
        )}
      </HmsCard>

      <NewRequisitionDialog
        slug={slug}
        open={newOpen}
        onOpenChange={setNewOpen}
        locations={locations}
        items={items}
        canCreateItem={canCreateItem}
        onItemCreated={(item) => setItems((prev) => [...prev, item])}
        onDone={() => router.refresh()}
      />

      <IssueRequisitionDialog
        key={issueTarget?.id ?? "none"}
        slug={slug}
        requisition={issueTarget}
        onOpenChange={(next) => {
          if (!next) setIssueTarget(null);
        }}
        onDone={() => {
          setIssueTarget(null);
          router.refresh();
        }}
      />
    </div>
  );
}

function NewRequisitionDialog({
  slug,
  open,
  onOpenChange,
  locations,
  items,
  canCreateItem = false,
  onItemCreated,
  onDone,
}: {
  slug: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  locations: InventoryLocationRow[];
  items: InventoryItemRow[];
  canCreateItem?: boolean;
  onItemCreated?: (item: InventoryItemRow) => void;
  onDone: () => void;
}) {
  const [department, setDepartment] = useState<string>("");
  const [customDepartment, setCustomDepartment] = useState("");
  const [fromLocationId, setFromLocationId] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([emptyLine()]);
  const [submitting, setSubmitting] = useState(false);

  const itemById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);

  const reset = () => {
    setDepartment("");
    setCustomDepartment("");
    setFromLocationId("");
    setNotes("");
    setLines([emptyLine()]);
  };

  const updateLine = (key: string, patch: Partial<DraftLine>) => {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  };
  const addLine = () => setLines((prev) => [...prev, emptyLine()]);
  const removeLine = (key: string) =>
    setLines((prev) => (prev.length > 1 ? prev.filter((l) => l.key !== key) : prev));

  const resolvedDepartment = department === "Other" ? customDepartment.trim() : department;
  const canSubmit =
    resolvedDepartment.length > 0 &&
    fromLocationId.trim().length > 0 &&
    lines.some((l) => l.itemId && Number(l.qty) > 0);

  const submit = async () => {
    setSubmitting(true);
    try {
      const payloadLines = lines
        .filter((l) => l.itemId && Number(l.qty) > 0)
        .map((l) => ({ itemId: l.itemId, qty: Number(l.qty) }));

      const res = await fetch("/api/hotel/inventory/requisitions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug,
          requestingDepartment: resolvedDepartment,
          fromLocationId,
          notes: notes.trim() || undefined,
          lines: payloadLines,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toastError("Could not create requisition", data.error ?? "Try again.");
        return;
      }
      toastSuccess(`Requisition ${data.requisition?.requisition_number ?? ""} submitted`);
      onOpenChange(false);
      reset();
      onDone();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) reset();
      }}
    >
      <DialogContent className="flex max-h-[min(90vh,calc(100vh-2rem))] max-w-2xl flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="shrink-0 border-b border-slate-100 px-6 py-5 pr-12">
          <DialogTitle>New requisition</DialogTitle>
          <DialogDescription>Request stock from a store on behalf of a department.</DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <HmsField id="inventory-requisition-department" label="Requesting department">
                <Select value={department} onValueChange={setDepartment}>
                  <SelectTrigger id="inventory-requisition-department" className="rounded-xl border-slate-300">
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
                <input
                  aria-label="Department name"
                  className={`${hmsInput} mt-2`}
                  value={customDepartment}
                  onChange={(e) => setCustomDepartment(e.target.value)}
                  placeholder="Department name"
                />
              ) : null}
            </div>
            <HmsField id="inventory-requisition-from" label="From store">
              <Select value={fromLocationId} onValueChange={setFromLocationId}>
                <SelectTrigger id="inventory-requisition-from" className="rounded-xl border-slate-300">
                  <SelectValue placeholder="Select a store" />
                </SelectTrigger>
                <SelectContent>
                  {locations.map((loc) => (
                    <SelectItem key={loc.id} value={loc.id}>
                      {loc.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </HmsField>
            <div className="sm:col-span-2">
              <HmsField id="inventory-requisition-notes" label="Notes" optional>
                <input
                  id="inventory-requisition-notes"
                  className={hmsInput}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </HmsField>
            </div>
          </div>

          <div role="group" aria-labelledby="inventory-requisition-lines" className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 id="inventory-requisition-lines" className="text-sm font-medium text-slate-800">Items requested</h3>
              <button type="button" className={`${hmsButton.secondary} ${smallButton} ${focusRing}`} onClick={addLine}>
                <Plus className="h-3.5 w-3.5" aria-hidden />
                Add line
              </button>
            </div>

            <div className="space-y-2">
              {lines.map((line, index) => {
                const item = itemById.get(line.itemId);
                return (
                  <div
                    key={line.key}
                    className="grid grid-cols-12 items-center gap-2 rounded-xl border border-slate-200 p-2"
                  >
                    <div className="col-span-7">
                      <InventoryItemPicker
                        slug={slug}
                        items={items}
                        value={line.itemId}
                        onValueChange={(v) => updateLine(line.key, { itemId: v })}
                        canCreateItem={canCreateItem}
                        onItemCreated={onItemCreated}
                        placeholder="Select item"
                      />
                    </div>
                    <div className="col-span-4">
                      <input
                        type="number"
                        min="0"
                        step="any"
                        aria-label={`Quantity, line ${index + 1}`}
                        className={hmsInput}
                        value={line.qty}
                        onChange={(e) => updateLine(line.key, { qty: e.target.value })}
                        placeholder="Qty"
                      />
                    </div>
                    <div className="col-span-1 flex justify-end">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Remove line ${index + 1}`}
                        onClick={() => removeLine(line.key)}
                        disabled={lines.length === 1}
                      >
                        <Trash2 className="h-4 w-4 text-slate-600" aria-hidden />
                      </Button>
                    </div>
                    {item ? (
                      <p className="col-span-12 text-xs text-slate-600">Unit: {item.unit_of_measure_name}</p>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <DialogFooter className="shrink-0 border-t border-slate-100 px-6 py-4">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button type="button" disabled={!canSubmit || submitting} onClick={() => void submit()}>
            {submitting ? "Submitting…" : "Submit requisition"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function IssueRequisitionDialog({
  slug,
  requisition,
  onOpenChange,
  onDone,
}: {
  slug: string;
  requisition: InventoryRequisitionWithLines | null;
  onOpenChange: (open: boolean) => void;
  onDone: () => void;
}) {
  const lines = useMemo(() => {
    if (!requisition) return [];
    return requisition.lines.map((l) => ({
      ...l,
      remaining: l.qty_requested - l.qty_issued,
    }));
  }, [requisition]);

  // Lazy-initialized from the requisition this instance was mounted for — the parent
  // remounts this component (via `key`) whenever a different requisition is targeted,
  // so this never needs to re-sync on prop changes.
  const [qtyByLine, setQtyByLine] = useState<Record<string, string>>(() => {
    const draft: Record<string, string> = {};
    for (const l of lines) draft[l.id] = String(Math.max(l.remaining, 0));
    return draft;
  });
  const [submitting, setSubmitting] = useState(false);

  const open = Boolean(requisition);

  const submit = async () => {
    if (!requisition) return;
    setSubmitting(true);
    try {
      const payloadLines = lines
        .filter((l) => l.remaining > 0)
        .map((l) => ({ lineId: l.id, qtyIssued: Number(qtyByLine[l.id] ?? 0) }))
        .filter((l) => l.qtyIssued > 0);

      if (payloadLines.length === 0) {
        toastError("Nothing to issue", "Enter a quantity greater than zero for at least one item.");
        return;
      }

      const res = await fetch(`/api/hotel/inventory/requisitions/${requisition.id}/issue`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, lines: payloadLines }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toastError("Could not issue stock", data.error ?? "Try again.");
        return;
      }
      toastSuccess(`Stock issued for ${requisition.requisition_number}`);
      onDone();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Issue stock</DialogTitle>
          <DialogDescription>
            {requisition
              ? `${requisition.requisition_number} · ${requisition.requesting_department} · from ${requisition.from_location_name}`
              : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          {lines.map((l) => (
            <div key={l.id} className="grid grid-cols-12 items-center gap-2 rounded-xl border border-slate-200 p-3">
              <div className="col-span-7 text-sm text-slate-900">
                <label htmlFor={`inventory-issue-${l.id}`} className="font-medium">
                  {l.item_name} <span className="text-xs font-normal text-slate-600">({l.item_sku})</span>
                </label>
                <p className="text-xs text-slate-600">
                  Requested {l.qty_requested} {l.unit_of_measure} · issued {l.qty_issued}
                </p>
              </div>
              <div className="col-span-5">
                <input
                  id={`inventory-issue-${l.id}`}
                  type="number"
                  min="0"
                  max={l.remaining}
                  step="any"
                  disabled={l.remaining <= 0}
                  value={qtyByLine[l.id] ?? ""}
                  onChange={(e) => setQtyByLine((prev) => ({ ...prev, [l.id]: e.target.value }))}
                  placeholder="Qty to issue"
                  className={`${hmsInput} disabled:bg-slate-50 disabled:text-slate-600`}
                />
              </div>
            </div>
          ))}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button type="button" disabled={submitting} onClick={() => void submit()}>
            {submitting ? "Issuing…" : "Issue stock"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

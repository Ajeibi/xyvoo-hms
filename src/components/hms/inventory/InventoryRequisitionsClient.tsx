"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Search, Trash2 } from "lucide-react";
import { SettingsSectionInfo } from "@/components/hms/settings/SettingsSectionInfo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

const STATUS_BADGE: Record<InventoryRequisitionStatus, string> = {
  pending: "bg-amber-50 text-amber-700",
  approved: "bg-blue-50 text-blue-700",
  partially_issued: "bg-violet-50 text-violet-700",
  issued: "bg-emerald-50 text-emerald-700",
  rejected: "bg-red-50 text-red-700",
  cancelled: "bg-slate-100 text-slate-600",
};

const STATUS_RAIL: Record<InventoryRequisitionStatus, string> = {
  pending: "bg-amber-500",
  approved: "bg-blue-600",
  partially_issued: "bg-violet-600",
  issued: "bg-emerald-600",
  rejected: "bg-red-600",
  cancelled: "bg-slate-400",
};

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
  return (
    <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11.5px] font-semibold ${STATUS_BADGE[status]}`}>
      {STATUS_LABEL[status]}
    </span>
  );
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

  return (
    <div className="mt-6">
      <p className="mb-1.5 text-xs text-slate-400">Inventory</p>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-center gap-1.5">
          <h1 className="text-[23px] font-semibold tracking-tight text-slate-900">Requisitions</h1>
          <SettingsSectionInfo
            title="Requisitions"
            text="Department stock requests. A request must be approved before it can be issued — issuing is the step that actually deducts stock from the store, not the initial request."
          />
        </div>
        <Button
          type="button"
          className="rounded-lg shadow-sm"
          onClick={() => setNewOpen(true)}
          disabled={locations.length === 0 || items.length === 0}
        >
          <Plus className="h-4 w-4" />
          New requisition
        </Button>
      </div>

      <div className="relative mb-5 max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by req #, department, or item"
          className="pl-9"
        />
      </div>

      <div className="flex flex-wrap gap-1">
        {STATUS_TABS.map((tab) => {
          const active = statusFilter === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setStatusFilter(tab.key)}
              className={`whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                active ? "bg-blue-50 text-blue-700" : "text-slate-500 hover:bg-slate-50 hover:text-slate-800"
              }`}
            >
              {tab.label}
              <span className={`ml-1 text-xs ${active ? "text-blue-600" : "text-slate-400"}`}>
                {statusCounts[tab.key]}
              </span>
            </button>
          );
        })}
      </div>

      {groupedRows.length === 0 ? (
        <p className="mt-6 rounded-xl border border-slate-200 bg-white px-6 py-8 text-center text-sm text-slate-500">
          {requisitions.length === 0 ? "No requisitions in this view." : "No requisitions match your search."}
        </p>
      ) : (
        <div className="mt-6 space-y-6">
          {groupedRows.map((group) => (
            <div key={group.label}>
              <p className="mb-2.5 ml-0.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                {group.label}
              </p>
              <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                <Accordion type="multiple">
                  {group.rows.map((r) => {
                    const remainingTotal = r.lines.reduce((sum, l) => sum + (l.qty_requested - l.qty_issued), 0);
                    return (
                      <AccordionItem key={r.id} value={r.id} className="relative border-slate-100">
                        <span className={`absolute inset-y-0 left-0 w-[3px] ${STATUS_RAIL[r.status]}`} aria-hidden />
                        <AccordionTrigger className="items-center rounded-none border-none py-3.5 pl-4 pr-4 hover:bg-slate-50/60 hover:no-underline">
                          <span className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-2 pr-2 text-left">
                            <span className="min-w-0">
                              <span className="block text-[13.5px] font-semibold tabular-nums text-slate-900">
                                {r.requisition_number}
                              </span>
                              <span className="mt-0.5 block text-[12.5px] text-slate-500">
                                <span className="font-medium text-slate-700">{r.requesting_department}</span> · from{" "}
                                {r.from_location_name} · {formatTime(r.created_at)}
                              </span>
                            </span>
                            <StatusBadge status={r.status} />
                          </span>
                        </AccordionTrigger>
                        <AccordionContent className="bg-slate-50/50">
                          <div className="space-y-3 pl-[30px] pr-4">
                            <ul className="divide-y divide-slate-100">
                              {r.lines.map((l) => (
                                <li key={l.id} className="flex items-center justify-between gap-2 py-2 text-[13px]">
                                  <span className="min-w-0 truncate text-slate-900">
                                    {l.item_name} <span className="text-xs font-normal text-slate-400">{l.item_sku}</span>
                                  </span>
                                  <span className="shrink-0 tabular-nums text-[12.5px] text-slate-500">
                                    {l.qty_issued} / {l.qty_requested} {l.unit_of_measure} issued
                                  </span>
                                </li>
                              ))}
                            </ul>
                            {r.notes ? <p className="text-xs text-slate-500">Note: {r.notes}</p> : null}

                            <div className="flex flex-wrap gap-2 pb-1">
                              {r.status === "pending" ? (
                                <>
                                  <Button
                                    type="button"
                                    size="sm"
                                    className="rounded-lg"
                                    disabled={busyId === r.id}
                                    onClick={() => void patchAction(r.id, "approve", `${r.requisition_number} approved`)}
                                  >
                                    Approve
                                  </Button>
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="destructive"
                                    className="rounded-lg"
                                    disabled={busyId === r.id}
                                    onClick={() => void patchAction(r.id, "reject", `${r.requisition_number} rejected`)}
                                  >
                                    Reject
                                  </Button>
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    className="rounded-lg"
                                    disabled={busyId === r.id}
                                    onClick={() => void patchAction(r.id, "cancel", `${r.requisition_number} cancelled`)}
                                  >
                                    Cancel
                                  </Button>
                                </>
                              ) : null}
                              {r.status === "approved" || r.status === "partially_issued" ? (
                                <>
                                  <Button
                                    type="button"
                                    size="sm"
                                    className="rounded-lg"
                                    disabled={busyId === r.id || remainingTotal <= 0}
                                    onClick={() => setIssueTarget(r)}
                                  >
                                    Issue
                                  </Button>
                                  {r.status === "approved" ? (
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="outline"
                                      className="rounded-lg"
                                      disabled={busyId === r.id}
                                      onClick={() => void patchAction(r.id, "cancel", `${r.requisition_number} cancelled`)}
                                    >
                                      Cancel
                                    </Button>
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
            </div>
          ))}
        </div>
      )}

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

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Requesting department</label>
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
                <Input
                  className="mt-2"
                  value={customDepartment}
                  onChange={(e) => setCustomDepartment(e.target.value)}
                  placeholder="Department name"
                />
              ) : null}
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">From store</label>
              <Select value={fromLocationId} onValueChange={setFromLocationId}>
                <SelectTrigger>
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
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-medium text-slate-600">Notes (optional)</label>
              <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes" />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-slate-600">Items requested</label>
              <Button type="button" variant="outline" size="sm" className="rounded-lg" onClick={addLine}>
                <Plus className="h-3.5 w-3.5" />
                Add line
              </Button>
            </div>

            <div className="space-y-2">
              {lines.map((line) => {
                const item = itemById.get(line.itemId);
                return (
                  <div
                    key={line.key}
                    className="grid grid-cols-12 items-center gap-2 rounded-lg border border-slate-200 p-2"
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
                      <Input
                        type="number"
                        min="0"
                        step="any"
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
                        onClick={() => removeLine(line.key)}
                        disabled={lines.length === 1}
                      >
                        <Trash2 className="h-4 w-4 text-slate-400" />
                      </Button>
                    </div>
                    {item ? (
                      <p className="col-span-12 -mt-1 text-xs text-slate-400">{item.unit_of_measure_name}</p>
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
            <div key={l.id} className="grid grid-cols-12 items-center gap-2 rounded-lg border border-slate-200 p-2">
              <div className="col-span-7 text-sm text-slate-700">
                {l.item_name} <span className="text-xs text-slate-400">({l.item_sku})</span>
                <p className="text-xs text-slate-400">
                  Requested {l.qty_requested} {l.unit_of_measure} · issued {l.qty_issued}
                </p>
              </div>
              <div className="col-span-5">
                <Input
                  type="number"
                  min="0"
                  max={l.remaining}
                  step="any"
                  disabled={l.remaining <= 0}
                  value={qtyByLine[l.id] ?? ""}
                  onChange={(e) => setQtyByLine((prev) => ({ ...prev, [l.id]: e.target.value }))}
                  placeholder="Qty to issue"
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

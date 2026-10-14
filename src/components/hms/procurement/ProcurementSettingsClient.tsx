"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ClipboardCheck, Plus, ShieldCheck, Tags, Trash2, X } from "lucide-react";
import { HmsCard, HmsField, HmsPill, hmsButton, hmsInput } from "@/components/hms/hms-ui";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toastError, toastSuccess } from "@/lib/app-toast";
import type { InventoryItemTypeRow } from "@/lib/hms/inventory-types";
import type { ApprovalThresholdRow, ApproverRole, QualityChecklistWithItemType, VendorCategoryRow } from "@/lib/hms/procurement-types";

const APPROVER_LABELS: Record<ApproverRole, string> = { auto: "Auto-approve", gm: "GM / Owner", finance: "Finance" };

export function ProcurementSettingsClient({
  slug,
  categories,
  thresholds,
  checklists,
  itemTypes,
}: {
  slug: string;
  categories: VendorCategoryRow[];
  thresholds: ApprovalThresholdRow[];
  checklists: QualityChecklistWithItemType[];
  itemTypes: InventoryItemTypeRow[];
}) {
  return (
    <div className="space-y-6">
      <VendorCategoriesSection slug={slug} categories={categories} />
      <ApprovalThresholdsSection slug={slug} thresholds={thresholds} />
      <QualityChecklistsSection slug={slug} checklists={checklists} itemTypes={itemTypes} />
    </div>
  );
}

function VendorCategoriesSection({ slug, categories }: { slug: string; categories: VendorCategoryRow[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const addCategory = async () => {
    if (!name.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/hotel/procurement/vendor-categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, name: name.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toastError("Could not add category", data.error ?? "Try again.");
        return;
      }
      toastSuccess("Vendor category added");
      setName("");
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  };

  const removeCategory = async (id: string) => {
    const res = await fetch(`/api/hotel/procurement/vendor-categories/${id}?slug=${encodeURIComponent(slug)}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      toastError("Could not remove category", data.error ?? "Try again.");
      return;
    }
    router.refresh();
  };

  return (
    <HmsCard
      id="procurement-vendor-categories"
      title="Vendor categories"
      description="Used to group vendors and to roll up spend-by-category reporting."
      icon={Tags}
      meaning="stock"
    >
      {categories.length === 0 ? (
        <p className="text-sm text-slate-600">No categories yet. Add your first one below.</p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {categories.map((c) => (
            <li key={c.id} className="flex items-center gap-1 rounded-full border border-teal-200 bg-teal-50 py-1 pl-3 pr-1 text-sm text-teal-900">
              {c.name}
              <button
                type="button"
                onClick={() => void removeCategory(c.id)}
                className="inline-flex h-7 w-7 items-center justify-center rounded-full text-slate-600 hover:bg-white hover:text-rose-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                <X className="h-3.5 w-3.5" aria-hidden />
                <span className="sr-only">Remove {c.name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-4 flex flex-wrap items-end gap-2">
        <div className="w-full max-w-xs">
          <HmsField id="procurement-new-category" label="New category name">
            <input id="procurement-new-category" className={hmsInput} value={name} onChange={(e) => setName(e.target.value)} />
          </HmsField>
        </div>
        <button type="button" className={hmsButton.primary} disabled={!name.trim() || submitting} onClick={() => void addCategory()}>
          <Plus className="h-4 w-4" aria-hidden /> Add
        </button>
      </div>
    </HmsCard>
  );
}

function ApprovalThresholdsSection({ slug, thresholds }: { slug: string; thresholds: ApprovalThresholdRow[] }) {
  const router = useRouter();
  const [department, setDepartment] = useState("All departments");
  const [minAmount, setMinAmount] = useState("0");
  const [maxAmount, setMaxAmount] = useState("");
  const [approverRole, setApproverRole] = useState<ApproverRole>("gm");
  const [submitting, setSubmitting] = useState(false);

  const addThreshold = async () => {
    setSubmitting(true);
    try {
      const res = await fetch("/api/hotel/procurement/approval-thresholds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug,
          department: department.trim() || "All departments",
          minAmount: Number(minAmount) || 0,
          maxAmount: maxAmount ? Number(maxAmount) : null,
          approverRole,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toastError("Could not add threshold", data.error ?? "Try again.");
        return;
      }
      toastSuccess("Approval threshold added");
      setMinAmount("0");
      setMaxAmount("");
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  };

  const removeThreshold = async (id: string) => {
    const res = await fetch(`/api/hotel/procurement/approval-thresholds/${id}?slug=${encodeURIComponent(slug)}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      toastError("Could not remove threshold", data.error ?? "Try again.");
      return;
    }
    router.refresh();
  };

  return (
    <HmsCard
      id="procurement-approval-thresholds"
      title="Approval thresholds"
      description="Every purchase order is checked against these bands by amount and department. The most specific match wins; everything needs GM/Owner sign-off until you set this up."
      icon={ShieldCheck}
      meaning="team"
    >
      {thresholds.length === 0 ? (
        <p className="text-sm text-slate-600">No thresholds yet, so every purchase order goes to the GM/Owner.</p>
      ) : (
        <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
          {thresholds.map((t) => (
            <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
              <span className="text-slate-700">
                <span className="font-medium text-slate-900">{t.department}</span>:{" "}
                <span className="tabular-nums">
                  {t.min_amount.toLocaleString()} to {t.max_amount === null ? "no limit" : t.max_amount.toLocaleString()}
                </span>{" "}
                needs <HmsPill tone="blue">{APPROVER_LABELS[t.approver_role]}</HmsPill>
              </span>
              <button type="button" onClick={() => void removeThreshold(t.id)} className={hmsButton.danger}>
                <Trash2 className="h-4 w-4" aria-hidden />
                <span className="sr-only">Remove threshold for {t.department}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <HmsField id="threshold-department" label="Department">
          <input id="threshold-department" className={hmsInput} value={department} onChange={(e) => setDepartment(e.target.value)} />
        </HmsField>
        <HmsField id="threshold-min" label="From amount">
          <input id="threshold-min" type="number" min="0" inputMode="decimal" className={`${hmsInput} tabular-nums`} value={minAmount} onChange={(e) => setMinAmount(e.target.value)} />
        </HmsField>
        <HmsField id="threshold-max" label="Up to amount" hint="Leave blank for no upper limit.">
          <input
            id="threshold-max"
            type="number"
            min="0"
            inputMode="decimal"
            aria-describedby="threshold-max-hint"
            className={`${hmsInput} tabular-nums`}
            value={maxAmount}
            onChange={(e) => setMaxAmount(e.target.value)}
          />
        </HmsField>
        <HmsField id="threshold-approver" label="Who approves">
          <Select value={approverRole} onValueChange={(v) => setApproverRole(v as ApproverRole)}>
            <SelectTrigger id="threshold-approver" className="h-11 rounded-xl border-slate-300">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(APPROVER_LABELS) as ApproverRole[]).map((r) => (
                <SelectItem key={r} value={r}>
                  {APPROVER_LABELS[r]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </HmsField>
      </div>
      <button type="button" className={`${hmsButton.primary} mt-3`} disabled={submitting} onClick={() => void addThreshold()}>
        <Plus className="h-4 w-4" aria-hidden /> Add threshold
      </button>
    </HmsCard>
  );
}

function QualityChecklistsSection({
  slug,
  checklists,
  itemTypes,
}: {
  slug: string;
  checklists: QualityChecklistWithItemType[];
  itemTypes: InventoryItemTypeRow[];
}) {
  const router = useRouter();
  const [itemTypeId, setItemTypeId] = useState("");
  const [items, setItems] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const save = async () => {
    if (!itemTypeId || !items.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/hotel/procurement/quality-checklists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug,
          itemTypeId,
          checklistItems: items
            .split("\n")
            .map((i) => i.trim())
            .filter(Boolean),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toastError("Could not save checklist", data.error ?? "Try again.");
        return;
      }
      toastSuccess("Quality checklist saved");
      setItems("");
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  };

  const removeChecklist = async (id: string) => {
    const res = await fetch(`/api/hotel/procurement/quality-checklists/${id}?slug=${encodeURIComponent(slug)}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      toastError("Could not remove checklist", data.error ?? "Try again.");
      return;
    }
    router.refresh();
  };

  return (
    <HmsCard
      id="procurement-quality-checklists"
      title="Quality inspection checklists"
      description="One checklist per item type, shown at receiving before a delivery is accepted into stock, such as temperature and expiry checks for perishables."
      icon={ClipboardCheck}
      meaning="stock"
    >
      {checklists.length === 0 ? (
        <p className="text-sm text-slate-600">No checklists yet. Deliveries are checked with a single pass or fail tick until you add one.</p>
      ) : (
        <ul className="space-y-3">
          {checklists.map((c) => (
            <li key={c.id} className="flex items-start justify-between gap-2 rounded-xl border border-slate-200 p-4">
              <div>
                <p className="text-sm font-medium text-slate-900">{c.item_type_name}</p>
                <ul className="mt-1 list-inside list-disc text-sm text-slate-700">
                  {c.checklist_items.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
              <button type="button" onClick={() => void removeChecklist(c.id)} className={`${hmsButton.danger} shrink-0`}>
                <Trash2 className="h-4 w-4" aria-hidden />
                <span className="sr-only">Remove checklist for {c.item_type_name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4 space-y-3">
        <HmsField id="checklist-item-type" label="Item type">
          <Select value={itemTypeId} onValueChange={setItemTypeId}>
            <SelectTrigger id="checklist-item-type" className="h-11 rounded-xl border-slate-300">
              <SelectValue placeholder="Select item type" />
            </SelectTrigger>
            <SelectContent>
              {itemTypes.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </HmsField>
        <HmsField id="checklist-items" label="Checklist items" hint="One item per line.">
          <textarea
            id="checklist-items"
            aria-describedby="checklist-items-hint"
            value={items}
            onChange={(e) => setItems(e.target.value)}
            placeholder={"Temperature within safe range\nNo visible damage or spoilage\nExpiry date confirmed"}
            rows={4}
            className={hmsInput}
          />
        </HmsField>
        <button type="button" className={hmsButton.primary} disabled={!itemTypeId || !items.trim() || submitting} onClick={() => void save()}>
          Save checklist
        </button>
      </div>
    </HmsCard>
  );
}

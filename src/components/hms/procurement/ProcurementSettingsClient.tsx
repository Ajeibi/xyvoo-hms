"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
    <div className="mt-6 space-y-6">
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
    <div className="rounded-2xl border border-slate-200 bg-white p-6">
      <h2 className="text-sm font-semibold text-slate-900">Vendor categories</h2>
      <p className="mt-1 text-xs text-slate-500">Used to group vendors and to roll up spend-by-category reporting.</p>
      <ul className="mt-3 flex flex-wrap gap-2">
        {categories.map((c) => (
          <span key={c.id} className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-700">
            {c.name}
            <button type="button" onClick={() => void removeCategory(c.id)} className="text-slate-400 hover:text-red-600">
              <Trash2 className="h-3 w-3" />
            </button>
          </span>
        ))}
      </ul>
      <div className="mt-3 flex gap-2">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="New category name" className="max-w-xs" />
        <Button type="button" size="sm" className="rounded-lg" disabled={!name.trim() || submitting} onClick={() => void addCategory()}>
          <Plus className="h-3.5 w-3.5" /> Add
        </Button>
      </div>
    </div>
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
    <div className="rounded-2xl border border-slate-200 bg-white p-6">
      <h2 className="text-sm font-semibold text-slate-900">Approval thresholds</h2>
      <p className="mt-1 text-xs text-slate-500">
        Every purchase order is checked against these bands by amount and department. The most specific match wins; everything
        defaults to requiring GM/Owner sign-off until you configure this.
      </p>

      <div className="mt-3 space-y-2">
        {thresholds.map((t) => (
          <div key={t.id} className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-sm">
            <span className="text-slate-700">
              {t.department}: {t.min_amount.toLocaleString()} – {t.max_amount === null ? "∞" : t.max_amount.toLocaleString()} →{" "}
              <span className="font-medium">{APPROVER_LABELS[t.approver_role]}</span>
            </span>
            <button type="button" onClick={() => void removeThreshold(t.id)} className="text-slate-400 hover:text-red-600">
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Input value={department} onChange={(e) => setDepartment(e.target.value)} placeholder="Department" />
        <Input type="number" min="0" value={minAmount} onChange={(e) => setMinAmount(e.target.value)} placeholder="Min amount" />
        <Input type="number" min="0" value={maxAmount} onChange={(e) => setMaxAmount(e.target.value)} placeholder="Max amount (blank = ∞)" />
        <Select value={approverRole} onValueChange={(v) => setApproverRole(v as ApproverRole)}>
          <SelectTrigger>
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
      </div>
      <Button type="button" size="sm" className="mt-2 rounded-lg" disabled={submitting} onClick={() => void addThreshold()}>
        <Plus className="h-3.5 w-3.5" /> Add threshold
      </Button>
    </div>
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
    <div className="rounded-2xl border border-slate-200 bg-white p-6">
      <h2 className="text-sm font-semibold text-slate-900">Quality inspection checklists</h2>
      <p className="mt-1 text-xs text-slate-500">
        One checklist per item type, shown to the store keeper at receiving before a delivery is accepted into stock —
        e.g. temperature and expiry checks for perishables, thread-count and condition checks for linen.
      </p>

      <div className="mt-3 space-y-3">
        {checklists.map((c) => (
          <div key={c.id} className="flex items-start justify-between gap-2 rounded-lg border border-slate-200 p-3">
            <div>
              <p className="text-sm font-medium text-slate-800">{c.item_type_name}</p>
              <ul className="mt-1 list-inside list-disc text-xs text-slate-600">
                {c.checklist_items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
            <button type="button" onClick={() => void removeChecklist(c.id)} className="shrink-0 text-slate-400 hover:text-red-600">
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>

      <div className="mt-4 space-y-2">
        <Select value={itemTypeId} onValueChange={setItemTypeId}>
          <SelectTrigger>
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
        <textarea
          value={items}
          onChange={(e) => setItems(e.target.value)}
          placeholder={"One checklist item per line, e.g.\nTemperature within safe range\nNo visible damage or spoilage\nExpiry date confirmed"}
          rows={4}
          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
        />
        <Button type="button" size="sm" className="rounded-lg" disabled={!itemTypeId || !items.trim() || submitting} onClick={() => void save()}>
          Save checklist
        </Button>
      </div>
    </div>
  );
}

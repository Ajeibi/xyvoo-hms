"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toastError, toastSuccess } from "@/lib/app-toast";
import { formatPricingAmount } from "@/lib/hms/room-pricing";
import type { InventoryItemRow } from "@/lib/hms/inventory-types";
import type {
  PurchaseOrderWithLines,
  VendorCategoryRow,
  VendorPriceCatalogWithItem,
  VendorScorecard,
  VendorStatus,
  VendorWithCategory,
} from "@/lib/hms/procurement-types";

const STATUS_OPTIONS: VendorStatus[] = ["active", "preferred", "inactive", "blacklisted"];

export function ProcurementVendorDetailClient({
  slug,
  vendor,
  categories,
  priceCatalog,
  scorecard,
  orders,
  items,
  currency,
}: {
  slug: string;
  vendor: VendorWithCategory;
  categories: VendorCategoryRow[];
  priceCatalog: VendorPriceCatalogWithItem[];
  scorecard: VendorScorecard;
  orders: PurchaseOrderWithLines[];
  items: InventoryItemRow[];
  currency: string;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<VendorStatus>(vendor.status);
  const [categoryId, setCategoryId] = useState<string>(vendor.category_id ?? "");
  const [savingField, setSavingField] = useState(false);
  const [priceDialogOpen, setPriceDialogOpen] = useState(false);
  const [reviewDialogOpen, setReviewDialogOpen] = useState(false);

  const patchVendor = async (body: Record<string, unknown>, successMsg: string, rollback: () => void) => {
    setSavingField(true);
    try {
      const res = await fetch(`/api/hotel/procurement/vendors/${vendor.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, ...body }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toastError("Could not update vendor", data.error ?? "Try again.");
        rollback();
        return;
      }
      toastSuccess(successMsg);
      router.refresh();
    } finally {
      setSavingField(false);
    }
  };

  const changeStatus = (next: VendorStatus) => {
    setStatus(next);
    void patchVendor({ status: next }, "Vendor status updated", () => setStatus(vendor.status));
  };

  const changeCategory = (next: string) => {
    setCategoryId(next);
    void patchVendor({ categoryId: next }, "Vendor category updated", () => setCategoryId(vendor.category_id ?? ""));
  };

  const [certifications, setCertifications] = useState<string[]>(vendor.certifications.map((c) => c.label));
  const [newCertification, setNewCertification] = useState("");

  const addCertification = async () => {
    const label = newCertification.trim();
    if (!label || certifications.includes(label)) return;
    const next = [...certifications, label];
    setCertifications(next);
    setNewCertification("");
    await patchVendor({ certifications: next }, "Certification added", () => setCertifications(certifications));
  };

  const removeCertification = async (label: string) => {
    const next = certifications.filter((c) => c !== label);
    setCertifications(next);
    await patchVendor({ certifications: next }, "Certification removed", () => setCertifications(certifications));
  };

  return (
    <div className="px-8 py-8">
      <Link href={`/hms/${slug}/procurement/vendors`} className="mb-4 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
        <ArrowLeft className="h-4 w-4" /> Back to vendors
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">{vendor.name}</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            {vendor.category_name ?? "Uncategorized"} · {vendor.country ?? "—"} · {vendor.lead_time_days} day lead time
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Select value={categoryId} onValueChange={changeCategory}>
            <SelectTrigger className="w-44" disabled={savingField}>
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              {categories.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={status} onValueChange={(v) => changeStatus(v as VendorStatus)}>
            <SelectTrigger className="w-36" disabled={savingField}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((s) => (
                <SelectItem key={s} value={s} className="capitalize">
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-6">
          <h2 className="text-sm font-semibold text-slate-800">Contact & terms</h2>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between"><dt className="text-slate-500">Contact</dt><dd className="text-slate-800">{vendor.contact_name ?? "—"}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">Phone</dt><dd className="text-slate-800">{vendor.phone ?? "—"}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">Email</dt><dd className="text-slate-800">{vendor.email ?? "—"}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">Payment terms</dt><dd className="text-slate-800">{vendor.payment_terms ?? "—"}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">Currency</dt><dd className="text-slate-800">{vendor.currency}</dd></div>
          </dl>
          <div className="mt-3">
            <p className="mb-1 text-xs text-slate-500">Certifications / compliance</p>
            <div className="flex flex-wrap items-center gap-1">
              {certifications.map((label) => (
                <span
                  key={label}
                  className="flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700"
                >
                  {label}
                  <button type="button" onClick={() => void removeCertification(label)} className="text-emerald-500 hover:text-emerald-800">
                    ×
                  </button>
                </span>
              ))}
              <Input
                value={newCertification}
                onChange={(e) => setNewCertification(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void addCertification();
                  }
                }}
                placeholder="e.g. HACCP certified"
                className="h-7 w-40 text-xs"
              />
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-800">Performance scorecard</h2>
            <Button type="button" size="sm" variant="outline" className="rounded-lg" onClick={() => setReviewDialogOpen(true)}>
              Add review
            </Button>
          </div>
          <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
            <div><dt className="text-xs text-slate-400">Total orders</dt><dd className="text-slate-800">{scorecard.totalOrders}</dd></div>
            <div><dt className="text-xs text-slate-400">Total spend</dt><dd className="text-slate-800">{formatPricingAmount(scorecard.totalSpend, currency)}</dd></div>
            <div><dt className="text-xs text-slate-400">On-time rate</dt><dd className="text-slate-800">{scorecard.onTimeRate === null ? "—" : `${Math.round(scorecard.onTimeRate * 100)}%`}</dd></div>
            <div><dt className="text-xs text-slate-400">Avg quality score</dt><dd className="text-slate-800">{scorecard.avgQualityScore === null ? "—" : scorecard.avgQualityScore.toFixed(1)}</dd></div>
          </dl>
        </div>
      </div>

      <div className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <h2 className="text-sm font-semibold text-slate-900">Price catalog</h2>
          <Button type="button" size="sm" className="rounded-lg" onClick={() => setPriceDialogOpen(true)}>
            <Plus className="h-3.5 w-3.5" /> Add price
          </Button>
        </div>
        {priceCatalog.length === 0 ? (
          <p className="px-6 py-6 text-sm text-slate-500">No agreed prices recorded yet.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {priceCatalog.map((p) => (
              <li key={p.id} className="flex items-center justify-between px-6 py-3 text-sm">
                <span className="text-slate-800">{p.item_name} <span className="text-xs text-slate-400">({p.item_sku})</span></span>
                <span className="tabular-nums text-slate-600">{formatPricingAmount(p.unit_price, p.currency)} / {p.unit_of_measure}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="border-b border-slate-100 px-6 py-4">
          <h2 className="text-sm font-semibold text-slate-900">Order history</h2>
        </div>
        {orders.length === 0 ? (
          <p className="px-6 py-6 text-sm text-slate-500">No purchase orders placed with this vendor yet.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {orders.map((o) => (
              <li key={o.id}>
                <Link href={`/hms/${slug}/procurement/orders/${o.id}`} className="flex items-center justify-between px-6 py-3 text-sm hover:bg-slate-50">
                  <span className="text-slate-800">{o.po_number} <span className="text-xs capitalize text-slate-400">({o.status.replace(/_/g, " ")})</span></span>
                  <span className="tabular-nums text-slate-600">{formatPricingAmount(o.total, o.currency)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      <AddPriceDialog
        slug={slug}
        vendorId={vendor.id}
        items={items}
        open={priceDialogOpen}
        onOpenChange={setPriceDialogOpen}
        onDone={() => router.refresh()}
      />
      <AddReviewDialog
        slug={slug}
        vendorId={vendor.id}
        open={reviewDialogOpen}
        onOpenChange={setReviewDialogOpen}
        onDone={() => router.refresh()}
      />
    </div>
  );
}

function AddPriceDialog({
  slug,
  vendorId,
  items,
  open,
  onOpenChange,
  onDone,
}: {
  slug: string;
  vendorId: string;
  items: InventoryItemRow[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone: () => void;
}) {
  const [itemId, setItemId] = useState("");
  const [unitPrice, setUnitPrice] = useState("");
  const [moq, setMoq] = useState("0");
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    setSubmitting(true);
    try {
      const res = await fetch(`/api/hotel/procurement/vendors/${vendorId}/price-catalog`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, itemId, unitPrice: Number(unitPrice), moq: Number(moq) }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toastError("Could not save price", data.error ?? "Try again.");
        return;
      }
      toastSuccess("Price catalog updated");
      onOpenChange(false);
      setItemId("");
      setUnitPrice("");
      onDone();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add agreed price</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Select value={itemId} onValueChange={setItemId}>
            <SelectTrigger>
              <SelectValue placeholder="Select item" />
            </SelectTrigger>
            <SelectContent>
              {items.map((i) => (
                <SelectItem key={i.id} value={i.id}>
                  {i.name} ({i.sku})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input type="number" min="0" step="any" placeholder="Unit price" value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} />
          <Input type="number" min="0" step="any" placeholder="Minimum order quantity (optional)" value={moq} onChange={(e) => setMoq(e.target.value)} />
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button type="button" disabled={!itemId || !unitPrice || submitting} onClick={() => void submit()}>
            {submitting ? "Saving…" : "Save price"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AddReviewDialog({
  slug,
  vendorId,
  open,
  onOpenChange,
  onDone,
}: {
  slug: string;
  vendorId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone: () => void;
}) {
  const [onTime, setOnTime] = useState(true);
  const [qualityScore, setQualityScore] = useState("5");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    setSubmitting(true);
    try {
      const res = await fetch(`/api/hotel/procurement/vendors/${vendorId}/performance`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, onTime, qualityScore: Number(qualityScore), notes: notes || undefined }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toastError("Could not save review", data.error ?? "Try again.");
        return;
      }
      toastSuccess("Performance review recorded");
      onOpenChange(false);
      setNotes("");
      onDone();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Record a performance review</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" className="h-4 w-4 rounded border-slate-300" checked={onTime} onChange={(e) => setOnTime(e.target.checked)} />
            Delivery was on time
          </label>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Quality score (1–5)</label>
            <Input type="number" min="1" max="5" value={qualityScore} onChange={(e) => setQualityScore(e.target.value)} />
          </div>
          <Input placeholder="Notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button type="button" disabled={submitting} onClick={() => void submit()}>
            {submitting ? "Saving…" : "Save review"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

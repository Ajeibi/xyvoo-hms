"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, BadgeCheck, ChevronRight, ClipboardList, Contact, Gauge, Plus, ShoppingCart, Tag, Wallet, X } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { HmsCard, HmsEmptyState, HmsField, HmsPage, HmsPageHeader, HmsPill, HmsStatStrip, HmsStatTile, hmsButton, hmsInput } from "@/components/hms/hms-ui";
import { toastError, toastSuccess } from "@/lib/app-toast";
import { formatPricingAmount } from "@/lib/hms/room-pricing";
import type { InventoryItemRow } from "@/lib/hms/inventory-types";
import type {
  PurchaseOrderStatus,
  PurchaseOrderWithLines,
  VendorCategoryRow,
  VendorPriceCatalogWithItem,
  VendorScorecard,
  VendorStatus,
  VendorWithCategory,
} from "@/lib/hms/procurement-types";

const STATUS_OPTIONS: VendorStatus[] = ["active", "preferred", "inactive", "blacklisted"];

const VENDOR_STATUS_LABEL: Record<VendorStatus, string> = {
  active: "Active",
  preferred: "Preferred",
  inactive: "Inactive",
  blacklisted: "Blacklisted",
};

const VENDOR_STATUS_TONE: Record<VendorStatus, "slate" | "green" | "amber" | "red" | "blue"> = {
  active: "blue",
  preferred: "green",
  inactive: "slate",
  blacklisted: "red",
};

const ORDER_STATUS_PILL: Record<PurchaseOrderStatus, { label: string; tone: "slate" | "green" | "amber" | "red" | "blue" }> = {
  draft: { label: "Draft", tone: "slate" },
  pending_approval: { label: "Waiting for approval", tone: "amber" },
  approved: { label: "Approved", tone: "green" },
  ordered: { label: "Ordered", tone: "blue" },
  partially_received: { label: "Partly received", tone: "blue" },
  received: { label: "Received", tone: "green" },
  closed: { label: "Closed", tone: "slate" },
  rejected: { label: "Rejected", tone: "red" },
  cancelled: { label: "Cancelled", tone: "red" },
};

const selectTrigger = "h-11 rounded-xl border-slate-300";

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

  const contactRows: [string, string][] = [
    ["Contact", vendor.contact_name ?? "—"],
    ["Phone", vendor.phone ?? "—"],
    ["Email", vendor.email ?? "—"],
    ["Payment terms", vendor.payment_terms ?? "—"],
    ["Currency", vendor.currency],
  ];

  return (
    <HmsPage>
      <Link
        href={`/hms/${slug}/procurement/vendors`}
        className="inline-flex items-center gap-1 rounded text-sm font-medium text-slate-700 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden /> Back to vendors
      </Link>

      <HmsPageHeader
        eyebrow="Procurement"
        meaning="stock"
        title={vendor.name}
        description={`${vendor.category_name ?? "Uncategorised"} · ${vendor.country ?? "—"} · ${vendor.lead_time_days} day lead time`}
        actions={<HmsPill tone={VENDOR_STATUS_TONE[status]}>{VENDOR_STATUS_LABEL[status]}</HmsPill>}
      />

      <HmsStatStrip label="Vendor scorecard">
        <HmsStatTile icon={ShoppingCart} label="Total orders" value={scorecard.totalOrders.toLocaleString()} meaning="stock" />
        <HmsStatTile icon={Wallet} label="Total spend" value={formatPricingAmount(scorecard.totalSpend, currency)} meaning="money" />
        <HmsStatTile
          icon={Gauge}
          label="On-time rate"
          value={scorecard.onTimeRate === null ? "—" : `${Math.round(scorecard.onTimeRate * 100)}%`}
          hint={scorecard.onTimeRate === null ? "No reviews yet" : undefined}
          meaning="team"
        />
        <HmsStatTile
          icon={BadgeCheck}
          label="Average quality score"
          value={scorecard.avgQualityScore === null ? "—" : `${scorecard.avgQualityScore.toFixed(1)} / 5`}
          hint={scorecard.avgQualityScore === null ? "No reviews yet" : undefined}
          meaning="guests"
        />
      </HmsStatStrip>

      <div className="grid gap-6 md:grid-cols-2">
        <HmsCard id="vendor-settings" title="Status and category" description="Changes save straight away." icon={Tag} meaning="stock">
          <div className="grid gap-4 sm:grid-cols-2">
            <HmsField id="vendor-category" label="Category">
              <Select value={categoryId} onValueChange={changeCategory}>
                <SelectTrigger id="vendor-category" className={selectTrigger} disabled={savingField}>
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
            </HmsField>
            <HmsField id="vendor-status" label="Status">
              <Select value={status} onValueChange={(v) => changeStatus(v as VendorStatus)}>
                <SelectTrigger id="vendor-status" className={selectTrigger} disabled={savingField}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((s) => (
                    <SelectItem key={s} value={s}>
                      {VENDOR_STATUS_LABEL[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </HmsField>
          </div>

          <div className="mt-5">
            <p className="mb-2 text-sm font-medium text-slate-800">Certifications and compliance</p>
            {certifications.length ? (
              <ul className="mb-3 flex flex-wrap gap-2">
                {certifications.map((label) => (
                  <li key={label} className="flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 py-1 pl-3 pr-1 text-sm text-emerald-900">
                    {label}
                    <button
                      type="button"
                      onClick={() => void removeCertification(label)}
                      className="inline-flex h-7 w-7 items-center justify-center rounded-full text-emerald-800 hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                    >
                      <X className="h-3.5 w-3.5" aria-hidden />
                      <span className="sr-only">Remove {label}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            <HmsField id="vendor-new-certification" label="Add a certification" hint="Press Enter to add it, such as HACCP certified.">
              <input
                id="vendor-new-certification"
                aria-describedby="vendor-new-certification-hint"
                className={hmsInput}
                value={newCertification}
                onChange={(e) => setNewCertification(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void addCertification();
                  }
                }}
              />
            </HmsField>
          </div>
        </HmsCard>

        <HmsCard
          id="vendor-contact"
          title="Contact and terms"
          icon={Contact}
          meaning="team"
          actions={
            <button type="button" className={hmsButton.secondary} onClick={() => setReviewDialogOpen(true)}>
              <ClipboardList className="h-4 w-4" aria-hidden /> Add review
            </button>
          }
        >
          <dl className="divide-y divide-slate-100 text-sm">
            {contactRows.map(([label, value]) => (
              <div key={label} className="flex justify-between gap-3 py-2">
                <dt className="text-slate-600">{label}</dt>
                <dd className="text-right text-slate-900">{value}</dd>
              </div>
            ))}
          </dl>
        </HmsCard>
      </div>

      <HmsCard
        id="vendor-price-catalog"
        title="Price catalogue"
        description="Agreed prices are filled in when you source requisitions from this vendor."
        icon={Wallet}
        meaning="money"
        flush
        actions={
          <button type="button" className={hmsButton.primary} onClick={() => setPriceDialogOpen(true)}>
            <Plus className="h-4 w-4" aria-hidden /> Add price
          </button>
        }
      >
        {priceCatalog.length === 0 ? (
          <HmsEmptyState bare art="tag" meaning="money" title="No agreed prices yet" description="No agreed prices recorded yet." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50 text-left text-sm font-medium text-slate-600">
                  <th scope="col" className="px-5 py-3 font-medium sm:px-6">Item</th>
                  <th scope="col" className="px-5 py-3 text-right font-medium sm:px-6">Unit price</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {priceCatalog.map((p) => (
                  <tr key={p.id}>
                    <td className="px-5 py-3 text-slate-900 sm:px-6">
                      {p.item_name} <span className="text-slate-600">({p.item_sku})</span>
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums text-slate-900 sm:px-6">
                      {formatPricingAmount(p.unit_price, p.currency)} / {p.unit_of_measure}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </HmsCard>

      <HmsCard id="vendor-orders" title="Order history" icon={ShoppingCart} meaning="stock" flush>
        {orders.length === 0 ? (
          <HmsEmptyState bare art="truck" meaning="stock" title="No orders yet" description="No purchase orders placed with this vendor yet." />
        ) : (
          <ul className="divide-y divide-slate-100">
            {orders.map((o) => {
              const pill = ORDER_STATUS_PILL[o.status];
              return (
                <li key={o.id}>
                  <Link
                    href={`/hms/${slug}/procurement/orders/${o.id}`}
                    className="flex items-center justify-between gap-3 px-5 py-3 text-sm hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 sm:px-6"
                  >
                    <span className="flex min-w-0 flex-wrap items-center gap-2">
                      <span className="font-medium text-slate-900">{o.po_number}</span>
                      <HmsPill tone={pill.tone}>{pill.label}</HmsPill>
                    </span>
                    <span className="flex shrink-0 items-center gap-3">
                      <span className="tabular-nums text-slate-900">{formatPricingAmount(o.total, o.currency)}</span>
                      <ChevronRight className="h-4 w-4 text-slate-500" aria-hidden />
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </HmsCard>

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
    </HmsPage>
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
        <div className="space-y-4">
          <HmsField id="price-item" label="Item">
            <Select value={itemId} onValueChange={setItemId}>
              <SelectTrigger id="price-item" className={selectTrigger}>
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
          </HmsField>
          <HmsField id="price-unit-price" label="Unit price">
            <input
              id="price-unit-price"
              type="number"
              min="0"
              step="any"
              inputMode="decimal"
              className={`${hmsInput} tabular-nums`}
              value={unitPrice}
              onChange={(e) => setUnitPrice(e.target.value)}
            />
          </HmsField>
          <HmsField id="price-moq" label="Minimum order quantity" optional>
            <input
              id="price-moq"
              type="number"
              min="0"
              step="any"
              inputMode="decimal"
              className={`${hmsInput} tabular-nums`}
              value={moq}
              onChange={(e) => setMoq(e.target.value)}
            />
          </HmsField>
        </div>
        <DialogFooter>
          <button type="button" className={hmsButton.secondary} onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </button>
          <button type="button" className={hmsButton.primary} disabled={!itemId || !unitPrice || submitting} onClick={() => void submit()}>
            {submitting ? "Saving…" : "Save price"}
          </button>
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
        <div className="space-y-4">
          <label className="flex items-center gap-2 text-sm text-slate-800">
            <input
              type="checkbox"
              className="h-5 w-5 rounded border-slate-300 text-teal-700 focus-visible:ring-2 focus-visible:ring-blue-500"
              checked={onTime}
              onChange={(e) => setOnTime(e.target.checked)}
            />
            Delivery was on time
          </label>
          <HmsField id="review-quality" label="Quality score (1 to 5)">
            <input
              id="review-quality"
              type="number"
              min="1"
              max="5"
              inputMode="numeric"
              className={`${hmsInput} tabular-nums`}
              value={qualityScore}
              onChange={(e) => setQualityScore(e.target.value)}
            />
          </HmsField>
          <HmsField id="review-notes" label="Notes" optional>
            <input id="review-notes" className={hmsInput} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </HmsField>
        </div>
        <DialogFooter>
          <button type="button" className={hmsButton.secondary} onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </button>
          <button type="button" className={hmsButton.primary} disabled={submitting} onClick={() => void submit()}>
            {submitting ? "Saving…" : "Save review"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

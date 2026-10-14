"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight, Plus, Truck } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { HmsCard, HmsEmptyState, HmsField, HmsPill, hmsButton, hmsInput } from "@/components/hms/hms-ui";
import { HmsFilterChips, HmsSectionIntro } from "@/components/hms/hms-ui-client";
import { toastError, toastSuccess } from "@/lib/app-toast";
import type { VendorCategoryRow, VendorStatus, VendorWithCategory } from "@/lib/hms/procurement-types";

const STATUS_TONE: Record<VendorStatus, "slate" | "green" | "amber" | "red" | "blue"> = {
  active: "blue",
  preferred: "green",
  inactive: "slate",
  blacklisted: "red",
};

const STATUS_LABEL: Record<VendorStatus, string> = {
  active: "Active",
  preferred: "Preferred",
  inactive: "Inactive",
  blacklisted: "Blacklisted",
};

export function ProcurementVendorsClient({
  slug,
  vendors,
  categories,
}: {
  slug: string;
  vendors: VendorWithCategory[];
  categories: VendorCategoryRow[];
}) {
  const router = useRouter();
  const [statusFilter, setStatusFilter] = useState<"all" | VendorStatus>("all");
  const [newOpen, setNewOpen] = useState(false);

  const filtered = useMemo(
    () => (statusFilter === "all" ? vendors : vendors.filter((v) => v.status === statusFilter)),
    [vendors, statusFilter],
  );

  const filterOptions = useMemo(
    () =>
      (["all", "active", "preferred", "inactive", "blacklisted"] as const).map((s) => ({
        value: s,
        label: s === "all" ? "All" : STATUS_LABEL[s],
        count: s === "all" ? vendors.length : vendors.filter((v) => v.status === s).length,
      })),
    [vendors],
  );

  const newButton = (
    <button type="button" className={hmsButton.primary} onClick={() => setNewOpen(true)}>
      <Plus className="h-4 w-4" aria-hidden />
      New vendor
    </button>
  );

  return (
    <div className="space-y-6">
      <HmsSectionIntro
        id="procurement-vendors"
        title="Your approved suppliers"
        meaning="stock"
        art="truck"
        points={[
          "Only active and preferred vendors can be chosen on a new purchase order.",
          "Open a vendor to see their prices, orders and delivery record.",
        ]}
      />

      <HmsFilterChips label="Filter vendors by status" options={filterOptions} value={statusFilter} onChange={setStatusFilter} meaning="stock" />

      <HmsCard
        id="procurement-vendors-list"
        title="Vendors"
        description={`${filtered.length} ${filtered.length === 1 ? "vendor" : "vendors"} in this view`}
        icon={Truck}
        meaning="stock"
        flush
        actions={newButton}
      >
        {filtered.length === 0 ? (
          <HmsEmptyState
            bare
            art="truck"
            meaning="stock"
            title={vendors.length === 0 ? "No vendors yet" : "No vendors in this view"}
            description={vendors.length === 0 ? "Add your first supplier to start raising purchase orders." : "Try another filter to see more vendors."}
          />
        ) : (
          <ul className="divide-y divide-slate-100">
            {filtered.map((v) => (
              <li key={v.id}>
                <Link
                  href={`/hms/${slug}/procurement/vendors/${v.id}`}
                  className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 sm:px-6"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-slate-900">{v.name}</span>
                    <span className="block text-sm text-slate-600">
                      {v.category_name ?? "Uncategorised"}
                      {v.country ? ` · ${v.country}` : ""} · {v.lead_time_days} {v.lead_time_days === 1 ? "day" : "days"} lead time
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-3">
                    <HmsPill tone={STATUS_TONE[v.status]}>{STATUS_LABEL[v.status]}</HmsPill>
                    <ChevronRight className="h-4 w-4 text-slate-500" aria-hidden />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </HmsCard>

      <NewVendorDialog
        slug={slug}
        open={newOpen}
        onOpenChange={setNewOpen}
        categories={categories}
        onDone={() => router.refresh()}
      />
    </div>
  );
}

function NewVendorDialog({
  slug,
  open,
  onOpenChange,
  categories,
  onDone,
}: {
  slug: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: VendorCategoryRow[];
  onDone: () => void;
}) {
  const [name, setName] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [contactName, setContactName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [country, setCountry] = useState("");
  const [paymentTerms, setPaymentTerms] = useState("");
  const [leadTimeDays, setLeadTimeDays] = useState("7");
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setName("");
    setCategoryId("");
    setContactName("");
    setPhone("");
    setEmail("");
    setCountry("");
    setPaymentTerms("");
    setLeadTimeDays("7");
  };

  const canSubmit = name.trim().length > 0;

  const submit = async () => {
    setSubmitting(true);
    try {
      const res = await fetch("/api/hotel/procurement/vendors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug,
          name,
          categoryId: categoryId || undefined,
          contactName: contactName || undefined,
          phone: phone || undefined,
          email: email || undefined,
          country: country || undefined,
          paymentTerms: paymentTerms || undefined,
          leadTimeDays: Number(leadTimeDays) || 0,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toastError("Could not create vendor", data.error ?? "Try again.");
        return;
      }
      toastSuccess(`${data.vendor?.name ?? "Vendor"} added`);
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
      <DialogContent className="flex max-h-[min(90vh,calc(100vh-2rem))] max-w-lg flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="shrink-0 border-b border-slate-100 px-6 py-5 pr-12">
          <DialogTitle>New vendor</DialogTitle>
          <DialogDescription>Add a supplier to the approved-vendor register.</DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-5">
          <HmsField id="new-vendor-name" label="Vendor name">
            <input id="new-vendor-name" aria-required className={hmsInput} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Lagos Fresh Produce Ltd" />
          </HmsField>
          <HmsField id="new-vendor-category" label="Category" optional>
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger id="new-vendor-category" className="h-11 rounded-xl border-slate-300">
                <SelectValue placeholder="Select category" />
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
          <div className="grid gap-4 sm:grid-cols-2">
            <HmsField id="new-vendor-contact" label="Contact name" optional>
              <input id="new-vendor-contact" className={hmsInput} autoComplete="off" value={contactName} onChange={(e) => setContactName(e.target.value)} />
            </HmsField>
            <HmsField id="new-vendor-phone" label="Phone" optional>
              <input id="new-vendor-phone" type="tel" className={hmsInput} autoComplete="off" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </HmsField>
            <HmsField id="new-vendor-email" label="Email" optional>
              <input id="new-vendor-email" type="email" className={hmsInput} autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} />
            </HmsField>
            <HmsField id="new-vendor-country" label="Country" optional>
              <input id="new-vendor-country" className={hmsInput} value={country} onChange={(e) => setCountry(e.target.value)} />
            </HmsField>
            <HmsField id="new-vendor-terms" label="Payment terms" optional>
              <input id="new-vendor-terms" className={hmsInput} value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value)} placeholder="e.g. Net 30" />
            </HmsField>
            <HmsField id="new-vendor-lead-time" label="Lead time (days)">
              <input
                id="new-vendor-lead-time"
                type="number"
                min="0"
                inputMode="numeric"
                className={`${hmsInput} tabular-nums`}
                value={leadTimeDays}
                onChange={(e) => setLeadTimeDays(e.target.value)}
              />
            </HmsField>
          </div>
        </div>

        <DialogFooter className="shrink-0 border-t border-slate-100 px-6 py-4">
          <button type="button" className={hmsButton.secondary} onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </button>
          <button type="button" className={hmsButton.primary} disabled={!canSubmit || submitting} onClick={() => void submit()}>
            {submitting ? "Saving…" : "Add vendor"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

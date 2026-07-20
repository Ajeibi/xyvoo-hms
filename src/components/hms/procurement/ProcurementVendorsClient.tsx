"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toastError, toastSuccess } from "@/lib/app-toast";
import type { VendorCategoryRow, VendorStatus, VendorWithCategory } from "@/lib/hms/procurement-types";

const STATUS_BADGE: Record<VendorStatus, string> = {
  active: "bg-blue-50 text-blue-700 border-blue-200",
  preferred: "bg-emerald-50 text-emerald-700 border-emerald-200",
  inactive: "bg-slate-100 text-slate-500 border-slate-200",
  blacklisted: "bg-red-50 text-red-700 border-red-200",
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

  return (
    <div className="mt-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1">
          {(["all", "active", "preferred", "inactive", "blacklisted"] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatusFilter(s)}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium capitalize transition-colors ${
                statusFilter === s ? "border-blue-600 bg-blue-600 text-white" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
        <Button type="button" className="rounded-lg" onClick={() => setNewOpen(true)}>
          <Plus className="h-4 w-4" />
          New vendor
        </Button>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        {filtered.length === 0 ? (
          <p className="px-6 py-8 text-sm text-slate-500">No vendors in this view.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {filtered.map((v) => (
              <li key={v.id}>
                <Link href={`/hms/${slug}/procurement/vendors/${v.id}`} className="flex items-center justify-between gap-3 px-6 py-4 hover:bg-slate-50">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-900">{v.name}</p>
                    <p className="text-xs text-slate-500">
                      {v.category_name ?? "Uncategorized"}
                      {v.country ? ` · ${v.country}` : ""} · {v.lead_time_days}d lead time
                    </p>
                  </div>
                  <span className={`shrink-0 rounded-full border px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[v.status]}`}>
                    {STATUS_LABEL[v.status]}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

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

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-6 py-5">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Vendor name</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Lagos Fresh Produce Ltd" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Category</label>
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger>
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
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Contact name</label>
              <Input value={contactName} onChange={(e) => setContactName(e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Phone</label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Email</label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Country</label>
              <Input value={country} onChange={(e) => setCountry(e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Payment terms</label>
              <Input value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value)} placeholder="e.g. Net 30" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Lead time (days)</label>
              <Input type="number" min="0" value={leadTimeDays} onChange={(e) => setLeadTimeDays(e.target.value)} />
            </div>
          </div>
        </div>

        <DialogFooter className="shrink-0 border-t border-slate-100 px-6 py-4">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button type="button" disabled={!canSubmit || submitting} onClick={() => void submit()}>
            {submitting ? "Saving…" : "Add vendor"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

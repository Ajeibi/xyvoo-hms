"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toastError, toastSuccess } from "@/lib/app-toast";
import { SettingsSectionInfo } from "@/components/hms/settings/SettingsSectionInfo";
import type { InventorySupplierRow } from "@/lib/hms/inventory-types";

/**
 * Supplier register for Receiving — who you buy from, with contact details,
 * so a receipt can point at a real supplier record instead of free text.
 * Mirrors InventoryLookupManager's add/toggle-active/delete UX, but with the
 * extra contact fields suppliers need.
 */
export function InventorySupplierManager({ slug, suppliers }: { slug: string; suppliers: InventorySupplierRow[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [contactName, setContactName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const add = async () => {
    if (!name.trim()) {
      toastError("Supplier name required");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/hotel/inventory/suppliers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug,
          name: name.trim(),
          contactName: contactName.trim() || undefined,
          phone: phone.trim() || undefined,
          email: email.trim() || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toastError("Could not add supplier", data.error ?? "Try again.");
        return;
      }
      toastSuccess("Supplier added");
      setName("");
      setContactName("");
      setPhone("");
      setEmail("");
      router.refresh();
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (row: InventorySupplierRow) => {
    setBusyId(row.id);
    try {
      const res = await fetch(`/api/hotel/inventory/suppliers/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, isActive: !row.is_active }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toastError("Could not update supplier", data.error ?? "Try again.");
        return;
      }
      toastSuccess(row.is_active ? "Supplier marked inactive" : "Supplier marked active");
      router.refresh();
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (row: InventorySupplierRow) => {
    if (!window.confirm(`Delete "${row.name}"? This cannot be undone.`)) return;
    setBusyId(row.id);
    try {
      const res = await fetch(`/api/hotel/inventory/suppliers/${row.id}?slug=${encodeURIComponent(slug)}`, {
        method: "DELETE",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toastError("Could not delete supplier", data.error ?? "Try again.");
        return;
      }
      toastSuccess("Supplier deleted");
      router.refresh();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white">
      <div className="border-b border-slate-100 px-6 py-4">
        <div className="flex flex-wrap items-center gap-1.5">
          <h2 className="text-sm font-semibold text-slate-900">Suppliers</h2>
          <SettingsSectionInfo
            title="Suppliers"
            text="The register of who you buy from. Pick a supplier when receiving stock instead of retyping a name each time — contact details live here so anyone on the team can find them."
          />
        </div>
        <p className="mt-0.5 text-xs text-slate-500">Used when recording a goods receipt.</p>
      </div>

      <div className="grid gap-2 px-6 py-4 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Name</label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Fresh Foods Ltd" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Contact name</label>
          <Input value={contactName} onChange={(e) => setContactName(e.target.value)} placeholder="Optional" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Phone</label>
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Optional" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Email</label>
          <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Optional" />
        </div>
        <div className="sm:col-span-2 lg:col-span-4">
          <Button type="button" onClick={() => void add()} disabled={saving}>
            {saving ? "Adding…" : "Add supplier"}
          </Button>
        </div>
      </div>

      {suppliers.length === 0 ? (
        <p className="px-6 pb-6 text-sm text-slate-500">No suppliers yet.</p>
      ) : (
        <ul className="divide-y divide-slate-100 px-6 pb-2">
          {suppliers.map((row) => (
            <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium text-slate-900">{row.name}</span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      row.is_active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {row.is_active ? "Active" : "Inactive"}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-slate-500">
                  {[row.contact_name, row.phone, row.email].filter(Boolean).join(" · ") || "No contact details"}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button type="button" size="sm" variant="outline" onClick={() => void toggleActive(row)} disabled={busyId === row.id}>
                  {row.is_active ? "Deactivate" : "Activate"}
                </Button>
                <Button type="button" size="sm" variant="destructive" onClick={() => void remove(row)} disabled={busyId === row.id}>
                  Delete
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

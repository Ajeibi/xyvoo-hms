"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Truck } from "lucide-react";
import { toastError, toastSuccess } from "@/lib/app-toast";
import { SettingsSectionInfo } from "@/components/hms/settings/SettingsSectionInfo";
import { HmsCard, HmsEmptyState, HmsField, HmsPill, hmsButton, hmsInput } from "@/components/hms/hms-ui";

const SMALL_BUTTON = hmsButton.small;
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
    <HmsCard
      id="inventory-suppliers"
      title="Suppliers"
      description="Who you buy from. Used when recording a goods receipt."
      icon={Truck}
      meaning="stock"
      flush
      actions={
        <SettingsSectionInfo
          title="Suppliers"
          text="The register of who you buy from. Pick a supplier when receiving stock instead of retyping a name each time — contact details live here so anyone on the team can find them."
        />
      }
    >
      <div className="grid gap-4 px-5 py-4 sm:grid-cols-2 sm:px-6 lg:grid-cols-4">
        <HmsField id="inventory-supplier-name" label="Name">
          <input
            id="inventory-supplier-name"
            className={hmsInput}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Fresh Foods Ltd"
          />
        </HmsField>
        <HmsField id="inventory-supplier-contact" label="Contact name" optional>
          <input id="inventory-supplier-contact" className={hmsInput} value={contactName} onChange={(e) => setContactName(e.target.value)} />
        </HmsField>
        <HmsField id="inventory-supplier-phone" label="Phone" optional>
          <input
            id="inventory-supplier-phone"
            type="tel"
            autoComplete="off"
            className={hmsInput}
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </HmsField>
        <HmsField id="inventory-supplier-email" label="Email" optional>
          <input
            id="inventory-supplier-email"
            type="email"
            autoComplete="off"
            className={hmsInput}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </HmsField>
        <div className="sm:col-span-2 lg:col-span-4">
          <button type="button" className={hmsButton.primary} onClick={() => void add()} disabled={saving}>
            <Plus className="h-4 w-4" aria-hidden />
            {saving ? "Adding…" : "Add supplier"}
          </button>
        </div>
      </div>

      {suppliers.length === 0 ? (
        <div className="border-t border-slate-100">
          <HmsEmptyState
            bare
            art="truck"
            meaning="stock"
            title="No suppliers yet"
            description="Add the businesses you buy from, so receipts can name a real supplier."
          />
        </div>
      ) : (
        <ul className="divide-y divide-slate-100 border-t border-slate-100">
          {suppliers.map((row) => (
            <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm sm:px-6">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium text-slate-900">{row.name}</span>
                  <HmsPill tone={row.is_active ? "green" : "slate"}>{row.is_active ? "Active" : "Inactive"}</HmsPill>
                </div>
                <p className="mt-0.5 text-sm text-slate-600">
                  {[row.contact_name, row.phone, row.email].filter(Boolean).join(" · ") || "No contact details"}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button type="button" className={SMALL_BUTTON} onClick={() => void toggleActive(row)} disabled={busyId === row.id}>
                  {row.is_active ? "Deactivate" : "Activate"}
                  <span className="sr-only"> {row.name}</span>
                </button>
                <button type="button" className={hmsButton.danger} onClick={() => void remove(row)} disabled={busyId === row.id}>
                  <Trash2 className="h-4 w-4" aria-hidden />
                  Delete<span className="sr-only"> {row.name}</span>
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </HmsCard>
  );
}

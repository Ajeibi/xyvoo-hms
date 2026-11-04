"use client";

import { useState } from "react";
import { toastError, toastSuccess } from "@/lib/app-toast";
import { HmsAlert, HmsField, hmsButton, hmsInput } from "@/components/hms/hms-ui";

export type CompanyDraft = {
  name: string;
  contactName: string;
  phone: string;
  email: string;
  address: string;
  paymentTerms: string;
  taxId: string;
  industry: string;
  accountManager: string;
  negotiatedRateNote: string;
  notes: string;
};

export const EMPTY_COMPANY: CompanyDraft = {
  name: "",
  contactName: "",
  phone: "",
  email: "",
  address: "",
  paymentTerms: "",
  taxId: "",
  industry: "",
  accountManager: "",
  negotiatedRateNote: "",
  notes: "",
};

/** Adds a company, or changes one when `companyId` is given. */
export function CompanyForm({
  slug,
  companyId,
  initial,
  onSaved,
  onCancel,
}: {
  slug: string;
  companyId?: string;
  initial: CompanyDraft;
  onSaved: (id: string) => void;
  onCancel: () => void;
}) {
  const [v, setV] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const set = <K extends keyof CompanyDraft>(k: K, value: string) => setV((p) => ({ ...p, [k]: value }));
  const uid = companyId ?? "new";

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const res = await fetch(companyId ? `/api/hotel/guests/companies/${companyId}` : "/api/hotel/guests/companies", {
        method: companyId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, ...v }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Could not save. Try again.");
        toastError("Could not save the company", data.error ?? "Try again.");
        return;
      }
      toastSuccess(companyId ? "Company saved" : "Company added");
      onSaved((data.id as string | undefined) ?? companyId ?? "");
    } finally {
      setSaving(false);
    }
  };

  const field = (key: keyof CompanyDraft, label: string, opts?: { optional?: boolean; type?: string; span?: string; hint?: string; area?: boolean }) => (
    <div className={opts?.span ?? "sm:col-span-3"}>
      <HmsField id={`${uid}-${key}`} label={label} optional={opts?.optional ?? true} hint={opts?.hint}>
        {opts?.area ? (
          <textarea id={`${uid}-${key}`} rows={3} className={hmsInput} value={v[key]} onChange={(e) => set(key, e.target.value)} />
        ) : (
          <input id={`${uid}-${key}`} type={opts?.type ?? "text"} className={hmsInput} value={v[key]} onChange={(e) => set(key, e.target.value)} required={opts?.optional === false} />
        )}
      </HmsField>
    </div>
  );

  return (
    <form onSubmit={save} className="space-y-4" aria-label={companyId ? "Change company details" : "Add a company"}>
      <HmsAlert message={error} />
      <div className="grid gap-4 sm:grid-cols-6">
        {field("name", "Company name", { optional: false })}
        {field("industry", "Industry")}
        {field("contactName", "Contact person")}
        {field("accountManager", "Your account manager", { hint: "Who at the hotel looks after them." })}
        {field("phone", "Phone", { type: "tel" })}
        {field("email", "Email", { type: "email" })}
        {field("address", "Address", { span: "sm:col-span-6" })}
        {field("paymentTerms", "Payment terms", { hint: "For example 30 days." })}
        {field("taxId", "Tax ID (TIN)")}
        {field("negotiatedRateNote", "Agreed rates", { span: "sm:col-span-6", area: true, hint: "For example: 15% off rack rate, breakfast included." })}
        {field("notes", "Notes", { span: "sm:col-span-6", area: true })}
      </div>
      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" className={hmsButton.secondary} onClick={onCancel} disabled={saving}>
          Cancel
        </button>
        <button type="submit" className={hmsButton.primary} disabled={saving}>
          {saving ? "Saving…" : companyId ? "Save changes" : "Add company"}
        </button>
      </div>
    </form>
  );
}

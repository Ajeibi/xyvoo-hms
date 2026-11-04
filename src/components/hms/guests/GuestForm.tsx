"use client";

import { useState } from "react";
import { toastError, toastSuccess } from "@/lib/app-toast";
import { HmsAlert, HmsField, hmsButton, hmsInput } from "@/components/hms/hms-ui";
import {
  CONTACT_CHANNELS,
  GENDERS,
  GUEST_LANGUAGES,
  ID_TYPES,
  ID_TYPE_LABEL,
  type CompanyOption,
  type GuestEditable,
} from "@/lib/hms/guest-fields";

const words = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * The form for a guest's details, used to add a guest and to change one. On save it asks the
 * server (POST /api/hotel/guests or PATCH /api/hotel/guests/:id), then calls onSaved.
 */
export function GuestForm({
  slug,
  guestId,
  initial,
  companies,
  onSaved,
  onCancel,
}: {
  slug: string;
  /** Set when changing an existing guest; empty when adding one. */
  guestId?: string;
  initial: GuestEditable;
  companies: CompanyOption[];
  onSaved: (id: string) => void;
  onCancel: () => void;
}) {
  const [v, setV] = useState<GuestEditable>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const set = <K extends keyof GuestEditable>(key: K, value: GuestEditable[K]) => setV((p) => ({ ...p, [key]: value }));
  const uid = guestId ?? "new";

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const fields = { ...v, companyId: v.companyId || null };
      const res = await fetch(guestId ? `/api/hotel/guests/${guestId}` : "/api/hotel/guests", {
        method: guestId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, fields }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Could not save. Try again.");
        toastError("Could not save the guest", data.error ?? "Try again.");
        return;
      }
      toastSuccess(guestId ? "Guest details saved" : "Guest added");
      onSaved((data.id as string | undefined) ?? guestId ?? "");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={save} className="space-y-5" aria-label={guestId ? "Change guest details" : "Add a guest"}>
      <HmsAlert message={error} />

      <fieldset className="grid grid-cols-1 gap-4 sm:grid-cols-6">
        <legend className="mb-2 text-sm font-semibold text-slate-900">Who they are</legend>
        <div className="sm:col-span-1">
          <HmsField id={`${uid}-title`} label="Title" optional>
            <input id={`${uid}-title`} className={hmsInput} value={v.title} onChange={(e) => set("title", e.target.value)} placeholder="Mr" />
          </HmsField>
        </div>
        <div className="sm:col-span-2">
          <HmsField id={`${uid}-first`} label="First name">
            <input id={`${uid}-first`} className={hmsInput} required value={v.firstName} onChange={(e) => set("firstName", e.target.value)} />
          </HmsField>
        </div>
        <div className="sm:col-span-2">
          <HmsField id={`${uid}-last`} label="Last name">
            <input id={`${uid}-last`} className={hmsInput} required value={v.lastName} onChange={(e) => set("lastName", e.target.value)} />
          </HmsField>
        </div>
        <div className="sm:col-span-1">
          <HmsField id={`${uid}-gender`} label="Gender" optional>
            <select id={`${uid}-gender`} className={hmsInput} value={v.gender} onChange={(e) => set("gender", e.target.value)}>
              {GENDERS.map((g) => (
                <option key={g} value={g}>
                  {words(g)}
                </option>
              ))}
            </select>
          </HmsField>
        </div>
        <div className="sm:col-span-2">
          <HmsField id={`${uid}-dob`} label="Date of birth">
            <input id={`${uid}-dob`} type="date" className={hmsInput} required value={v.dateOfBirth} onChange={(e) => set("dateOfBirth", e.target.value)} />
          </HmsField>
        </div>
        <div className="sm:col-span-2">
          <HmsField id={`${uid}-nat`} label="Nationality" hint="Two-letter code, like NG">
            <input
              id={`${uid}-nat`}
              className={hmsInput}
              required
              maxLength={2}
              value={v.nationality}
              onChange={(e) => set("nationality", e.target.value.toUpperCase())}
            />
          </HmsField>
        </div>
        <div className="sm:col-span-2">
          <HmsField id={`${uid}-lang`} label="Language" optional>
            <select id={`${uid}-lang`} className={hmsInput} value={v.language} onChange={(e) => set("language", e.target.value)}>
              <option value="">Not set</option>
              {GUEST_LANGUAGES.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
          </HmsField>
        </div>
      </fieldset>

      <fieldset className="grid grid-cols-1 gap-4 sm:grid-cols-6">
        <legend className="mb-2 text-sm font-semibold text-slate-900">Their ID</legend>
        <div className="sm:col-span-2">
          <HmsField id={`${uid}-idtype`} label="ID type">
            <select id={`${uid}-idtype`} className={hmsInput} value={v.idType} onChange={(e) => set("idType", e.target.value as GuestEditable["idType"])}>
              {ID_TYPES.map((t) => (
                <option key={t} value={t}>
                  {ID_TYPE_LABEL[t]}
                </option>
              ))}
            </select>
          </HmsField>
        </div>
        <div className="sm:col-span-2">
          <HmsField id={`${uid}-idnum`} label="ID number">
            <input id={`${uid}-idnum`} className={hmsInput} required value={v.idNumber} onChange={(e) => set("idNumber", e.target.value)} />
          </HmsField>
        </div>
        <div className="sm:col-span-2">
          <HmsField id={`${uid}-idexp`} label="ID expires">
            <input id={`${uid}-idexp`} type="date" className={hmsInput} required value={v.idExpiryDate} onChange={(e) => set("idExpiryDate", e.target.value)} />
          </HmsField>
        </div>
      </fieldset>

      <fieldset className="grid grid-cols-1 gap-4 sm:grid-cols-6">
        <legend className="mb-2 text-sm font-semibold text-slate-900">How to reach them</legend>
        <div className="sm:col-span-2">
          <HmsField id={`${uid}-phone`} label="Phone">
            <input id={`${uid}-phone`} type="tel" className={hmsInput} required value={v.phone} onChange={(e) => set("phone", e.target.value)} />
          </HmsField>
        </div>
        <div className="sm:col-span-2">
          <HmsField id={`${uid}-wa`} label="WhatsApp" optional>
            <input id={`${uid}-wa`} type="tel" className={hmsInput} value={v.whatsapp} onChange={(e) => set("whatsapp", e.target.value)} />
          </HmsField>
        </div>
        <div className="sm:col-span-2">
          <HmsField id={`${uid}-channel`} label="Prefers to be contacted by">
            <select
              id={`${uid}-channel`}
              className={hmsInput}
              value={v.preferredChannel}
              onChange={(e) => set("preferredChannel", e.target.value as GuestEditable["preferredChannel"])}
            >
              {CONTACT_CHANNELS.map((c) => (
                <option key={c} value={c}>
                  {words(c)}
                </option>
              ))}
            </select>
          </HmsField>
        </div>
        <div className="sm:col-span-3">
          <HmsField id={`${uid}-email`} label="Email">
            <input id={`${uid}-email`} type="email" className={hmsInput} required value={v.email} onChange={(e) => set("email", e.target.value)} />
          </HmsField>
        </div>
        <div className="sm:col-span-3">
          <HmsField id={`${uid}-addr`} label="Address" optional>
            <input id={`${uid}-addr`} className={hmsInput} value={v.address} onChange={(e) => set("address", e.target.value)} />
          </HmsField>
        </div>
        <div className="sm:col-span-3">
          <HmsField id={`${uid}-city`} label="City" optional>
            <input id={`${uid}-city`} className={hmsInput} value={v.city} onChange={(e) => set("city", e.target.value)} />
          </HmsField>
        </div>
        <div className="sm:col-span-3">
          <HmsField id={`${uid}-country`} label="Country" optional>
            <input id={`${uid}-country`} className={hmsInput} value={v.country} onChange={(e) => set("country", e.target.value)} />
          </HmsField>
        </div>
      </fieldset>

      <fieldset className="grid grid-cols-1 gap-4 sm:grid-cols-6">
        <legend className="mb-2 text-sm font-semibold text-slate-900">Company and preferences</legend>
        <div className="sm:col-span-3">
          <HmsField id={`${uid}-company`} label="Company they travel for" optional hint="Companies are the customers in Accounts.">
            <select id={`${uid}-company`} className={hmsInput} value={v.companyId} onChange={(e) => set("companyId", e.target.value)}>
              <option value="">None</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </HmsField>
        </div>
        <div className="sm:col-span-6">
          <HmsField id={`${uid}-prefs`} label="Preferences" optional hint="Room, pillow, food, anything that makes the stay better.">
            <textarea id={`${uid}-prefs`} rows={3} className={hmsInput} value={v.preferences} onChange={(e) => set("preferences", e.target.value)} />
          </HmsField>
        </div>
      </fieldset>

      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" className={hmsButton.secondary} onClick={onCancel} disabled={saving}>
          Cancel
        </button>
        <button type="submit" className={hmsButton.primary} disabled={saving}>
          {saving ? "Saving…" : guestId ? "Save changes" : "Add guest"}
        </button>
      </div>
    </form>
  );
}

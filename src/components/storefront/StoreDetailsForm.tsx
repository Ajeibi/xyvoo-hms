"use client";

import { useEffect, useState } from "react";
import { CATEGORY_LABELS } from "@/lib/store/site/onboarding-steps";
import { STORE_CATEGORIES } from "@/lib/store/site/templates";
import { DashAlert, DashField, dashInput, DashStatus, sendJson } from "./dashboard-ui";

type Details = {
  storeName: string;
  category: string | null;
  businessEmail: string;
  phone: string;
  whatsapp: string;
  addressLine1: string;
  city: string;
  state: string;
  instagram: string;
  facebook: string;
  tiktok: string;
};

/** Settings → Store details. */
export default function StoreDetailsForm({ slug }: { slug: string }) {
  const [details, setDetails] = useState<Details | null>(null);
  const [canManage, setCanManage] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");

  useEffect(() => {
    fetch(`/api/store/profile?slug=${encodeURIComponent(slug)}`)
      .then((r) => r.json())
      .then((data) => {
        setDetails(data.details);
        setCanManage(Boolean(data.canManage));
      })
      .catch(() => setError("We couldn't load your store details. Please refresh the page."));
  }, [slug]);

  if (!details) return <p className="text-sm text-slate-500">{error || "Loading…"}</p>;

  const set = (key: keyof Details, value: string) => {
    setDetails((d) => (d ? { ...d, [key]: value } : d));
    setStatus("");
  };
  const text = (key: keyof Details, label: string, props: React.InputHTMLAttributes<HTMLInputElement> & { optional?: boolean } = {}) => {
    const { optional, ...rest } = props;
    return (
      <DashField id={`details-${key}`} label={label} optional={optional}>
        <input id={`details-${key}`} className={dashInput} value={details[key] ?? ""} onChange={(e) => set(key, e.target.value)} disabled={!canManage} {...rest} />
      </DashField>
    );
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      await sendJson("/api/store/profile", "PATCH", { slug, ...details });
      setStatus("Store details saved.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={save} className="space-y-6 rounded-2xl border border-slate-200 bg-white p-6" noValidate>
      <DashAlert message={error} />
      {text("storeName", "Store name", { autoComplete: "organization" })}
      <DashField id="details-category" label="What you sell">
        <select id="details-category" className={dashInput} value={details.category ?? ""} onChange={(e) => set("category", e.target.value)} disabled={!canManage}>
          <option value="" disabled>
            Choose one
          </option>
          {STORE_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {CATEGORY_LABELS[c]}
            </option>
          ))}
        </select>
      </DashField>
      <fieldset className="space-y-4">
        <legend className="text-base font-semibold text-slate-900">Contact details shown on your shop</legend>
        {text("businessEmail", "Business email", { type: "email", autoComplete: "email" })}
        <div className="grid gap-4 sm:grid-cols-2">
          {text("phone", "Phone number", { type: "tel", autoComplete: "tel" })}
          {text("whatsapp", "WhatsApp number", { type: "tel", optional: true })}
        </div>
        {text("addressLine1", "Street address", { autoComplete: "address-line1" })}
        <div className="grid gap-4 sm:grid-cols-2">
          {text("city", "Town or city", { autoComplete: "address-level2" })}
          {text("state", "State or region", { autoComplete: "address-level1" })}
        </div>
      </fieldset>
      <fieldset className="space-y-4">
        <legend className="text-base font-semibold text-slate-900">Social media</legend>
        {text("instagram", "Instagram", { type: "url", placeholder: "https://instagram.com/yourstore", optional: true })}
        {text("facebook", "Facebook", { type: "url", placeholder: "https://facebook.com/yourstore", optional: true })}
        {text("tiktok", "TikTok", { type: "url", placeholder: "https://tiktok.com/@yourstore", optional: true })}
      </fieldset>
      {canManage ? (
        <div className="flex items-center gap-4">
          <button type="submit" disabled={busy} className="rounded-xl bg-xyvoo-blue px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60">
            {busy ? "Saving…" : "Save store details"}
          </button>
          <DashStatus message={status} />
        </div>
      ) : (
        <p className="text-sm text-slate-500">Only the store owner or an admin can change these details.</p>
      )}
    </form>
  );
}

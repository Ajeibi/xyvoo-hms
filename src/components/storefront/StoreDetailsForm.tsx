"use client";

import { useEffect, useState } from "react";
import { Phone, Share2, Store } from "lucide-react";
import { CATEGORY_LABELS } from "@/lib/store/site/onboarding-steps";
import SocialLinksField from "./onboarding/SocialLinksField";
import { STORE_CATEGORIES } from "@/lib/store/site/templates";
import { DashAlert, dashButton, DashCard, DashField, dashInput, DashStatus, sendJson } from "./dashboard-ui";

/** A clear keyboard focus ring for buttons. */
const ring = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-xyvoo-blue";

function LoadingCards() {
  return (
    <div className="space-y-6" aria-hidden>
      {[3, 4].map((fields) => (
        <div key={fields} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 animate-pulse rounded-xl bg-slate-100 motion-reduce:animate-none" />
            <div className="h-4 w-40 animate-pulse rounded bg-slate-100 motion-reduce:animate-none" />
          </div>
          <div className="mt-5 space-y-4">
            {Array.from({ length: fields }, (_, i) => (
              <div key={i} className="h-11 animate-pulse rounded-xl bg-slate-100 motion-reduce:animate-none" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

type Details = {
  storeName: string;
  category: string | null;
  businessEmail: string;
  phone: string;
  whatsapp: string;
  addressLine1: string;
  city: string;
  state: string;
  socialLinks: string[];
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

  if (!details) {
    return error ? (
      <DashAlert message={error} />
    ) : (
      <>
        <p className="sr-only" role="status">
          Loading your store details
        </p>
        <LoadingCards />
      </>
    );
  }

  const set = (key: Exclude<keyof Details, "socialLinks">, value: string) => {
    setDetails((d) => (d ? { ...d, [key]: value } : d));
    setStatus("");
  };
  const text = (key: Exclude<keyof Details, "socialLinks">, label: string, props: React.InputHTMLAttributes<HTMLInputElement> & { optional?: boolean } = {}) => {
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
    <form onSubmit={save} className="space-y-6" noValidate>
      {!canManage ? (
        <p className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">Only the store owner or an admin can change these details.</p>
      ) : null}

      <DashCard id="details-about" icon={Store} title="About your store" description="Your shop’s name, and the kind of things you sell.">
        <div className="space-y-4">
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
        </div>
      </DashCard>

      <DashCard id="details-contact" icon={Phone} title="Contact details" description="Shown on your shop so customers can reach you.">
        <div className="space-y-4">
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
        </div>
      </DashCard>

      <DashCard id="details-social" icon={Share2} title="Social media" description="Links to your pages, shown as icons in your shop’s footer.">
        <p className="mb-3 text-sm text-slate-600">Paste a link to each of your pages, on any platform.</p>
        <SocialLinksField
          idPrefix="details-social"
          links={details.socialLinks ?? []}
          onChange={(socialLinks) => {
            setDetails((d) => (d ? { ...d, socialLinks } : d));
            setStatus("");
          }}
          inputClassName={dashInput}
          disabled={!canManage}
        />
      </DashCard>

      <DashAlert message={error} />
      {canManage ? (
        <div className="flex flex-wrap items-center gap-4">
          <button type="submit" disabled={busy} className={`${dashButton.primary} ${ring}`}>
            {busy ? "Saving…" : "Save store details"}
          </button>
          <DashStatus message={status} />
        </div>
      ) : null}
    </form>
  );
}

"use client";

import { useEffect, useState } from "react";
import { Percent } from "lucide-react";
import { DashAlert, dashButton, DashCard, DashField, dashInput, DashStatus, sendJson } from "./dashboard-ui";

type Form = { enabled: boolean; name: string; rate: string; inclusive: boolean; number: string; onDelivery: boolean };

/** A clear keyboard focus ring for buttons. */
const ring = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-xyvoo-blue";

const choice = (selected: boolean) =>
  `flex cursor-pointer items-start gap-3 rounded-xl border px-4 py-3 text-sm ${selected ? "border-blue-500 bg-blue-50 text-blue-900" : "border-slate-300 text-slate-700"}`;

/**
 * Tax (VAT) settings for the Payments page: whether the shop charges it, the
 * rate, whether prices already include it, and the registration number shown
 * on receipts. Checkout works the tax out from these.
 */
export default function TaxSettingsCard({ slug }: { slug: string }) {
  const [form, setForm] = useState<Form | null>(null);
  const [canManage, setCanManage] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [products, setProducts] = useState<{ total: number; charging: number } | null>(null);
  const [fixing, setFixing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/store/tax?slug=${encodeURIComponent(slug)}`)
      .then(async (r) => {
        const data = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(typeof data.error === "string" ? data.error : "We couldn't load your tax settings. Please refresh the page.");
        if (cancelled) return;
        const s = data.settings;
        setForm({
          enabled: Boolean(s.enabled),
          name: s.name || "VAT",
          rate: s.rate ? String(s.rate) : "",
          inclusive: s.inclusive !== false,
          number: s.number ?? "",
          onDelivery: Boolean(s.onDelivery),
        });
        setCanManage(Boolean(data.canManage));
        setProducts(data.products ?? null);
      })
      .catch((e: Error) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [slug]);

  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm((f) => (f ? { ...f, [key]: value } : f));

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form) return;
    setError("");
    setStatus("");
    setSaving(true);
    try {
      await sendJson("/api/store/tax", "PATCH", {
        slug,
        enabled: form.enabled,
        name: form.name,
        rate: form.rate || 0,
        inclusive: form.inclusive,
        number: form.number,
        onDelivery: form.onDelivery,
      });
      const name = form.name.trim() || "VAT";
      setStatus(
        form.enabled
          ? form.inclusive
            ? `Saved. Your prices include ${name}; receipts will show how much of each order is ${name}.`
            : `Saved. ${name} at ${form.rate}% will be added at checkout.`
          : `Saved. You don't charge ${name}.`,
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const name = form?.name.trim() || "VAT";
  const disabled = !canManage || saving;
  const notCharging = products ? products.total - products.charging : 0;

  const chargeAll = async () => {
    setError("");
    setStatus("");
    setFixing(true);
    try {
      const data = await sendJson("/api/store/tax", "POST", { slug, action: "charge-all" });
      setProducts(data.products);
      setStatus(`Done. All your products now charge ${name}.`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setFixing(false);
    }
  };

  return (
    <DashCard id="tax" icon={Percent} meaning="marketing" title="Tax and VAT" description="Whether you charge VAT, and how it shows at checkout and on receipts.">
      <DashStatus message={status} />
      <div className={`space-y-4 ${status ? "mt-3" : ""}`}>
        <DashAlert message={error} />
        {form === null ? (
          error ? null : (
            <p className="text-sm text-slate-600" role="status">
              Loading your tax settings…
            </p>
          )
        ) : (
          <form onSubmit={save} noValidate className="space-y-5">
            {!canManage ? <p className="text-sm text-slate-600">Only the owner or an admin can change these.</p> : null}

            <fieldset className="space-y-2">
              <legend className="mb-1 text-sm font-medium text-slate-800">Do you charge VAT?</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                <label className={choice(!form.enabled)}>
                  <input type="radio" name="tax-enabled" className="mt-0.5 accent-blue-600" checked={!form.enabled} onChange={() => set("enabled", false)} disabled={disabled} />
                  <span>No, I don&rsquo;t charge VAT</span>
                </label>
                <label className={choice(form.enabled)}>
                  <input type="radio" name="tax-enabled" className="mt-0.5 accent-blue-600" checked={form.enabled} onChange={() => set("enabled", true)} disabled={disabled} />
                  <span>Yes, I&rsquo;m registered and charge it</span>
                </label>
              </div>
            </fieldset>

            {form.enabled && products && notCharging > 0 ? (
              <div role="note" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                <p className="font-medium">
                  {products.charging === 0
                    ? `None of your products charge ${name} yet, so no ${name} will be added at checkout.`
                    : `${notCharging} of your ${products.total} products ${notCharging === 1 ? "is" : "are"} set not to charge ${name}.`}
                </p>
                <p className="mt-1">You can change this for one product in its &ldquo;Sale price and more pricing&rdquo; section, or for all of them here.</p>
                {canManage ? (
                  <button type="button" onClick={chargeAll} disabled={fixing} className={`${dashButton.secondary} mt-3`}>
                    {fixing ? "Updating…" : `Charge ${name} on all products`}
                  </button>
                ) : null}
              </div>
            ) : null}

            {form.enabled ? (
              <>
                <div className="grid gap-4 sm:grid-cols-2">
                  <DashField id="tax-rate" label="Rate (%)" hint="The percentage you charge, for example 7.5. Ask your accountant if you're not sure.">
                    <input
                      id="tax-rate"
                      className={dashInput}
                      type="number"
                      inputMode="decimal"
                      min={0}
                      max={100}
                      step="any"
                      value={form.rate}
                      onChange={(e) => set("rate", e.target.value)}
                      aria-describedby="tax-rate-hint"
                      disabled={disabled}
                    />
                  </DashField>
                  <DashField id="tax-name" label="What it's called" hint="Shown to customers, for example “VAT”.">
                    <input id="tax-name" className={dashInput} value={form.name} maxLength={30} onChange={(e) => set("name", e.target.value)} aria-describedby="tax-name-hint" disabled={disabled} />
                  </DashField>
                </div>

                <fieldset className="space-y-2">
                  <legend className="mb-1 text-sm font-medium text-slate-800">Do your prices already include {name}?</legend>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <label className={choice(form.inclusive)}>
                      <input type="radio" name="tax-inclusive" className="mt-0.5 accent-blue-600" checked={form.inclusive} onChange={() => set("inclusive", true)} disabled={disabled} />
                      <span>
                        <span className="block font-medium">Yes, my prices include it</span>
                        <span className="block text-xs text-slate-600">Customers pay the price they see. Checkout and receipts show how much of it is {name}.</span>
                      </span>
                    </label>
                    <label className={choice(!form.inclusive)}>
                      <input type="radio" name="tax-inclusive" className="mt-0.5 accent-blue-600" checked={!form.inclusive} onChange={() => set("inclusive", false)} disabled={disabled} />
                      <span>
                        <span className="block font-medium">No, add it at checkout</span>
                        <span className="block text-xs text-slate-600">{name} is added on top of your prices when customers pay.</span>
                      </span>
                    </label>
                  </div>
                </fieldset>

                <label className="flex items-start gap-3 text-sm text-slate-800">
                  <input type="checkbox" className="mt-0.5 h-4 w-4" checked={form.onDelivery} onChange={(e) => set("onDelivery", e.target.checked)} disabled={disabled} />
                  <span>Charge {name} on delivery too</span>
                </label>

                <DashField id="tax-number" label={`${name} registration number`} optional hint="Shown on your customers' receipts.">
                  <input id="tax-number" className={dashInput} value={form.number} maxLength={60} onChange={(e) => set("number", e.target.value)} aria-describedby="tax-number-hint" disabled={disabled} />
                </DashField>

                <p className="text-sm text-slate-600">
                  Products are taxed at this rate unless you mark them as zero-rated, exempt or not taxable when you edit them.
                </p>
              </>
            ) : null}

            {canManage ? (
              <button type="submit" disabled={saving} className={`${dashButton.primary} ${ring}`}>
                {saving ? "Saving…" : "Save tax settings"}
              </button>
            ) : null}
          </form>
        )}
      </div>
    </DashCard>
  );
}

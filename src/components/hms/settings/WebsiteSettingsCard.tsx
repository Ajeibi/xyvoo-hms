"use client";

import { useEffect, useState } from "react";
import { ExternalLink, Globe, Lock } from "lucide-react";
import { TemplatePreviewer } from "@/components/website/TemplatePreviewer";
import { HmsCard, HmsField, hmsButton, hmsInput } from "@/components/hms/hms-ui";
import { HOTEL_WEBSITE_TEMPLATES } from "@/constants/website-templates";
import { toastError, toastSuccess } from "@/lib/app-toast";
import type { WebsiteState } from "@/lib/hms/site/state";
import { STOREFRONT_ROOT_DOMAIN } from "@/lib/store/subdomain";

type Availability = { state: "idle" } | { state: "checking" } | { state: "ok" } | { state: "taken"; reason: string };

/** The hotel's public website: template, address, reservations email, and publishing. Owners and admins. */
export function WebsiteSettingsCard({ slug, initial }: { slug: string; initial: WebsiteState }) {
  const [site, setSite] = useState(initial);
  const [previewing, setPreviewing] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [address, setAddress] = useState(initial.address ?? "");
  const [email, setEmail] = useState(initial.reservationsEmail);
  const [payNote, setPayNote] = useState(initial.paymentNote);
  const [checked, setChecked] = useState<{ address: string; result: Availability } | null>(null);

  const api = `/api/hotel/website`;
  const addressChanged = address.trim().toLowerCase() !== (site.address ?? "");

  const wanted = address.trim().toLowerCase();
  // The answer is for the address it was asked about; typing on makes it stale, which reads as "checking".
  const availability: Availability =
    !wanted || wanted === (site.address ?? "") ? { state: "idle" } : checked?.address === wanted ? checked.result : { state: "checking" };

  // Asks whether the typed address is free once typing pauses.
  useEffect(() => {
    if (!wanted || wanted === (site.address ?? "")) return;
    const timer = setTimeout(async () => {
      const res = await fetch(`${api}/address?slug=${encodeURIComponent(slug)}&address=${encodeURIComponent(wanted)}`).catch(() => null);
      const data = await res?.json().catch(() => null);
      setChecked({ address: wanted, result: data?.available ? { state: "ok" } : { state: "taken", reason: data?.error || data?.reason || "That address can't be used." } });
    }, 400);
    return () => clearTimeout(timer);
  }, [wanted, site.address, slug, api]);

  async function send(key: string, path: string, method: "PUT" | "POST", body: Record<string, unknown>, done: string) {
    setBusy(key);
    try {
      const res = await fetch(`${api}${path}`, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ slug, ...body }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toastError("Could not save", data.error ?? "Try again.");
        if (Array.isArray(data.missing)) setSite((s) => ({ ...s, missing: data.missing }));
        return;
      }
      setSite(data);
      setAddress(data.address ?? "");
      setEmail(data.reservationsEmail);
      setPayNote(data.paymentNote ?? "");
      toastSuccess(done);
    } finally {
      setBusy(null);
    }
  }

  const previewTemplate = HOTEL_WEBSITE_TEMPLATES.find((t) => t.slug === previewing);
  const canPublish = site.missing.length === 0;

  return (
    <HmsCard id="website-setup" title="Website" icon={Globe} meaning="neutral">
      <div className="space-y-8">
        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-slate-900">Template</h3>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            {HOTEL_WEBSITE_TEMPLATES.map((t) => {
              const chosen = site.templateId === t.slug;
              return (
                <div key={t.slug} className={`rounded-xl border p-4 ${chosen ? "border-emerald-500 bg-emerald-50/40" : "border-slate-200 bg-white"}`}>
                  <div className="flex gap-1" aria-hidden>
                    {t.palette.map((c) => (
                      <span key={c} className="h-4 w-4 rounded-full border border-slate-200" style={{ background: c }} />
                    ))}
                  </div>
                  <p className="mt-2 font-semibold text-slate-900">{t.name}</p>
                  <p className="text-sm text-slate-600">{t.summary}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button type="button" className={hmsButton.secondary} onClick={() => setPreviewing(previewing === t.slug ? null : t.slug)}>
                      {previewing === t.slug ? "Close preview" : "Preview"}
                    </button>
                    <button
                      type="button"
                      className={hmsButton.primary}
                      disabled={chosen || busy !== null}
                      onClick={() => void send("template", "", "PUT", { templateId: t.slug }, "Template saved.")}
                    >
                      {chosen ? "Chosen" : "Use this"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
          {previewTemplate ? (
            <TemplatePreviewer
              template={previewTemplate}
              choose={{
                chosen: site.templateId === previewTemplate.slug,
                busy: busy === "template",
                onChoose: () => void send("template", "", "PUT", { templateId: previewTemplate.slug }, "Template saved."),
              }}
            />
          ) : null}
          <p className="text-xs text-slate-500">The preview shows sample text. On your website, the rooms, prices, extras and bookings come from your hotel setup.</p>
        </section>

        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-slate-900">Web address</h3>
          {site.templateId ? (
            <>
              <HmsField id="site-address" label="Address" hint={`Your site is served at <address>.${STOREFRONT_ROOT_DOMAIN}. Changes left in 30 days: ${site.changesLeft}. The old address keeps redirecting for 90 days.`}>
                <div className="flex flex-wrap items-center gap-2">
                  <input id="site-address" className={`${hmsInput} max-w-xs`} value={address} onChange={(e) => setAddress(e.target.value)} autoComplete="off" spellCheck={false} />
                  <span className="text-sm text-slate-600">.{STOREFRONT_ROOT_DOMAIN}</span>
                  <button
                    type="button"
                    className={hmsButton.secondary}
                    disabled={!addressChanged || availability.state !== "ok" || busy !== null}
                    onClick={() => void send("address", "/address", "POST", { address: address.trim().toLowerCase() }, "Web address saved.")}
                  >
                    {busy === "address" ? "Saving…" : "Save address"}
                  </button>
                </div>
              </HmsField>
              <p className="text-sm" aria-live="polite">
                {availability.state === "checking" ? <span className="text-slate-500">Checking…</span> : null}
                {availability.state === "ok" ? <span className="text-emerald-700">Available.</span> : null}
                {availability.state === "taken" ? <span className="text-red-700">{availability.reason}</span> : null}
              </p>
              {site.previous.length ? (
                <p className="text-xs text-slate-500">
                  Redirecting for now: {site.previous.map((p) => `${p.address} (until ${new Date(p.expiresAt).toLocaleDateString("en-GB")})`).join(", ")}.
                </p>
              ) : null}
            </>
          ) : (
            <p className="text-sm text-slate-600">Choose a template first.</p>
          )}
          <div className="flex items-center gap-2 rounded-lg border border-dashed border-slate-300 px-3 py-2 text-sm text-slate-500" aria-disabled="true">
            <Lock className="h-4 w-4" aria-hidden />
            Your own domain (for example www.yourhotel.com): coming soon.
          </div>
        </section>

        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-slate-900">Reservations email</h3>
          <HmsField id="site-email" label="Website bookings are sent to" hint="Every website booking and request is emailed to this address, and kept for the front desk. Guests can reply to those emails.">
            <div className="flex flex-wrap items-center gap-2">
              <input id="site-email" type="email" className={`${hmsInput} max-w-sm`} value={email} onChange={(e) => setEmail(e.target.value)} />
              <button
                type="button"
                className={hmsButton.secondary}
                disabled={email.trim().toLowerCase() === site.reservationsEmail || busy !== null || !site.templateId}
                onClick={() => void send("email", "", "PUT", { reservationsEmail: email.trim() }, "Reservations email saved.")}
              >
                {busy === "email" ? "Saving…" : "Save email"}
              </button>
            </div>
          </HmsField>
        </section>

        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-slate-900">Online booking</h3>
          <fieldset className="space-y-2">
            <legend className="text-sm text-slate-600">What happens when a guest books on your website</legend>
            {(
              [
                ["instant", "Confirm at once", "The guest sees live rooms and prices, books, and gets a confirmation email straight away. The room is theirs; two guests can never book the last one."],
                ["request", "Ask me first", "The guest sends a request and you reply by email. Nothing is reserved until you make the booking."],
              ] as const
            ).map(([value, label, hint]) => (
              <label key={value} className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 p-3 text-sm has-[:checked]:border-emerald-500 has-[:checked]:bg-emerald-50/40">
                <input
                  type="radio"
                  name="booking-mode"
                  className="mt-1"
                  checked={site.bookingMode === value}
                  disabled={busy !== null || !site.templateId}
                  onChange={() => void send("mode", "", "PUT", { bookingMode: value }, value === "instant" ? "Guests now book and are confirmed at once." : "Guests now send a request for you to answer.")}
                />
                <span>
                  <span className="font-medium text-slate-900">{label}</span>
                  <span className="block text-slate-600">{hint}</span>
                </span>
              </label>
            ))}
          </fieldset>
          <HmsField id="site-pay-note" label="How guests pay a deposit" hint="Shown to the guest and in their confirmation email when your deposit rules (Reservations settings) ask for one. The HMS never takes a payment: you record the deposit on the booking when it arrives.">
            <textarea id="site-pay-note" className={`${hmsInput} min-h-24 max-w-xl`} maxLength={800} value={payNote} onChange={(e) => setPayNote(e.target.value)} placeholder="For example: Transfer to GTBank 0123456789, Grand Hotel Ltd. Use your booking number as the reference, then send the receipt to reservations@yourhotel.com." />
          </HmsField>
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" className={hmsButton.secondary} disabled={payNote.trim() === site.paymentNote || busy !== null || !site.templateId} onClick={() => void send("paynote", "", "PUT", { paymentNote: payNote }, "Deposit instructions saved.")}>
              {busy === "paynote" ? "Saving…" : "Save deposit instructions"}
            </button>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={site.abandonedReminders}
                disabled={busy !== null || !site.templateId}
                onChange={(e) => void send("reminders", "", "PUT", { abandonedReminders: e.target.checked }, e.target.checked ? "Reminders are on." : "Reminders are off.")}
              />
              Email one reminder to a visitor who gave their email and didn&apos;t finish booking
            </label>
          </div>
        </section>

        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-slate-900">Publish</h3>
          <p className="text-sm text-slate-600">
            {site.published ? (
              <>
                Your website is live at{" "}
                <a className="font-medium text-emerald-700 underline" href={site.url ?? "#"} target="_blank" rel="noopener">
                  {site.url}
                </a>
                .
              </>
            ) : (
              "Your website isn't live yet. Only your team can see the draft."
            )}
          </p>
          {!site.published && site.missing.length ? (
            <ul className="list-disc space-y-1 pl-5 text-sm text-amber-800">
              {site.missing.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          ) : null}
          <div className="flex flex-wrap gap-2">
            {site.published ? (
              <button type="button" className={hmsButton.secondary} disabled={busy !== null} onClick={() => void send("publish", "/publish", "POST", { published: false }, "Website unpublished.")}>
                {busy === "publish" ? "Working…" : "Unpublish"}
              </button>
            ) : (
              <button type="button" className={hmsButton.primary} disabled={!canPublish || busy !== null} onClick={() => void send("publish", "/publish", "POST", { published: true }, "Website published.")}>
                {busy === "publish" ? "Working…" : "Publish website"}
              </button>
            )}
            {site.templateId ? (
              <a className={hmsButton.secondary} href={site.published && site.url ? site.url : site.previewPath} target="_blank" rel="noopener">
                {site.published ? "Open website" : "Preview draft"}
                <ExternalLink className="ml-1 inline h-4 w-4" aria-hidden />
              </a>
            ) : null}
          </div>
        </section>
      </div>
    </HmsCard>
  );
}

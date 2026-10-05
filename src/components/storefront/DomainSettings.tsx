"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Check, Copy, ExternalLink } from "lucide-react";
import { STOREFRONT_ROOT_DOMAIN } from "@/lib/store/subdomain";
import { DashAlert, DashField, dashInput, DashStatus, sendJson } from "./dashboard-ui";

type DomainState = {
  slug: string;
  url: string;
  previous: { slug: string; createdAt: string; expiresAt: string }[];
  changesLeft: number;
  canManage: boolean;
};

type Availability = { state: "idle" | "checking" | "available" } | { state: "taken"; reason: string };

const dateFormat: Intl.DateTimeFormatOptions = { day: "numeric", month: "long", year: "numeric" };

/** Tidies what the owner types without fighting them: a trailing hyphen stays until they type the next part. */
function normaliseAddress(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+/, "")
    .slice(0, 63);
}

/** Dashboard → Web address: copy the shop's link, or move it to a new address. */
export default function DomainSettings({ slug }: { slug: string }) {
  const justChanged = useSearchParams().get("changed") === "1";
  const [domain, setDomain] = useState<DomainState | null>(null);
  const [candidate, setCandidate] = useState("");
  const [availability, setAvailability] = useState<Availability>({ state: "idle" });
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`/api/store/domain?slug=${encodeURIComponent(slug)}`)
      .then(async (res) => ({ ok: res.ok, data: await res.json().catch(() => ({})) }))
      .then(({ ok, data }) => (ok ? setDomain(data) : setError(typeof data.error === "string" ? data.error : "We couldn't load your web address.")))
      .catch(() => setError("We couldn't load your web address. Please refresh the page."));
  }, [slug]);

  // Check the new address shortly after the owner stops typing.
  const currentSlug = domain?.slug;
  useEffect(() => {
    if (!currentSlug || candidate.length < 3 || candidate === currentSlug) return;
    const timer = window.setTimeout(() => {
      setAvailability({ state: "checking" });
      fetch(`/api/store/subdomain-check?slug=${encodeURIComponent(slug)}&candidate=${encodeURIComponent(candidate)}`)
        .then((res) => res.json())
        .then((data) =>
          setAvailability(data.available ? { state: "available" } : { state: "taken", reason: data.reason || data.error || "That address can't be used." }),
        )
        .catch(() => setAvailability({ state: "idle" }));
    }, 400);
    return () => window.clearTimeout(timer);
  }, [candidate, currentSlug, slug]);

  if (!domain) return <p className="text-sm text-slate-500">{error || "Loading…"}</p>;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(domain.url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      setError("We couldn't copy the link. Please select it and copy it yourself.");
    }
  };

  const onCandidate = (value: string) => {
    setCandidate(normaliseAddress(value));
    setAvailability({ state: "idle" });
    setConfirming(false);
    setError("");
  };

  const change = async () => {
    setBusy(true);
    setError("");
    try {
      const data = await sendJson("/api/store/domain", "POST", { slug, newSlug: candidate });
      // The dashboard's own address includes the store's, so reload it at the new one.
      window.location.assign(`/storefront/${data.slug}/domain?changed=1`);
    } catch (e) {
      setError((e as Error).message);
      setConfirming(false);
      setBusy(false);
    }
  };

  const canChange = domain.canManage && domain.changesLeft > 0;
  const ready = candidate !== domain.slug && availability.state === "available";

  return (
    <div className="space-y-6">
      {justChanged ? <DashStatus message="Your web address has changed. Links to your old address will forward here for 90 days." /> : null}

      <section aria-labelledby="domain-current" className="rounded-2xl border border-slate-200 bg-white p-6">
        <h2 id="domain-current" className="text-base font-semibold text-slate-900">
          Your shop&rsquo;s address
        </h2>
        <p className="mt-3 break-all rounded-xl bg-slate-50 px-4 py-3 font-mono text-sm text-slate-900">{domain.url}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" onClick={copy} className="inline-flex items-center gap-2 rounded-lg bg-xyvoo-blue px-4 py-2 text-sm font-semibold text-white">
            {copied ? <Check className="h-4 w-4" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
            {copied ? "Copied" : "Copy link"}
          </button>
          <a
            href={domain.url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
          >
            Visit your shop <ExternalLink className="h-3.5 w-3.5" aria-hidden />
            <span className="sr-only">(opens in a new tab)</span>
          </a>
        </div>
        <p className="sr-only" role="status">
          {copied ? "Link copied" : ""}
        </p>
      </section>

      <section aria-labelledby="domain-change" className="rounded-2xl border border-slate-200 bg-white p-6">
        <h2 id="domain-change" className="text-base font-semibold text-slate-900">
          Change your address
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          Links to your current address will keep working for 90 days and forward customers to the new one. Before then, update anywhere
          you&rsquo;ve shared it, such as social media profiles and printed materials.
        </p>

        {!domain.canManage ? (
          <p className="mt-4 text-sm text-slate-600">Only the shop&rsquo;s owner or an admin can change the address.</p>
        ) : domain.changesLeft === 0 ? (
          <p className="mt-4 text-sm text-slate-600">
            You&rsquo;ve changed your address three times in the last 30 days. You can change it again later, or contact us if you need help.
          </p>
        ) : null}

        {canChange ? (
          <form
            className="mt-5 space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (ready) setConfirming(true);
            }}
          >
            <DashField id="domain-new" label="New address" hint="Lowercase letters, numbers and hyphens, 3 to 63 characters.">
              <div className="flex items-stretch">
                <input
                  id="domain-new"
                  className={`${dashInput} rounded-r-none`}
                  value={candidate}
                  onChange={(e) => onCandidate(e.target.value)}
                  autoComplete="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  maxLength={63}
                  aria-describedby="domain-new-hint domain-new-availability"
                  aria-invalid={availability.state === "taken"}
                />
                <span className="flex items-center rounded-r-xl border border-l-0 border-slate-300 bg-slate-50 px-3 text-sm text-slate-600">
                  .{STOREFRONT_ROOT_DOMAIN}
                </span>
              </div>
            </DashField>
            <p id="domain-new-availability" role="status" className="min-h-5 text-sm">
              {availability.state === "checking" ? <span className="text-slate-600">Checking…</span> : null}
              {availability.state === "available" ? <span className="text-emerald-700">That address is free.</span> : null}
              {availability.state === "taken" ? <span className="text-red-700">{availability.reason}</span> : null}
            </p>

            {confirming ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900" role="alert">
                <p>
                  Move your shop from <strong>{domain.slug}</strong> to <strong>{candidate}</strong>? Your dashboard will reload at the new address.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button type="button" onClick={change} disabled={busy} className="rounded-lg bg-xyvoo-blue px-4 py-2 font-semibold text-white disabled:opacity-50">
                    {busy ? "Changing…" : "Yes, change my address"}
                  </button>
                  <button type="button" onClick={() => setConfirming(false)} disabled={busy} className="rounded-lg px-4 py-2 font-medium text-slate-700 hover:bg-white">
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="submit"
                disabled={!ready}
                className="rounded-lg bg-xyvoo-blue px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                Change address
              </button>
            )}
          </form>
        ) : null}

        {error ? (
          <div className="mt-4">
            <DashAlert message={error} />
          </div>
        ) : null}
      </section>

      {domain.previous.length ? (
        <section aria-labelledby="domain-previous" className="rounded-2xl border border-slate-200 bg-white p-6">
          <h2 id="domain-previous" className="text-base font-semibold text-slate-900">
            Old addresses still forwarding
          </h2>
          <ul className="mt-3 divide-y divide-slate-100 text-sm">
            {domain.previous.map((p) => (
              <li key={p.slug} className="flex flex-wrap justify-between gap-2 py-2">
                <span className="font-mono text-slate-800">
                  {p.slug}.{STOREFRONT_ROOT_DOMAIN}
                </span>
                <span className="text-slate-600">Forwards until {new Date(p.expiresAt).toLocaleDateString("en-GB", dateFormat)}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

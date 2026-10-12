"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Check, Copy, ExternalLink, Globe, History, PencilLine } from "lucide-react";
import { STOREFRONT_ROOT_DOMAIN } from "@/lib/store/subdomain";
import { DashAlert, dashButton, DashCard, DashField, dashInput, DashPill, DashStatus, sendJson } from "./dashboard-ui";

type DomainState = {
  slug: string;
  url: string;
  previous: { slug: string; createdAt: string; expiresAt: string }[];
  changesLeft: number;
  canManage: boolean;
};

type Availability = { state: "idle" | "checking" | "available" } | { state: "taken"; reason: string };

const dateFormat: Intl.DateTimeFormatOptions = { day: "numeric", month: "long", year: "numeric" };

/** A clear keyboard focus ring for buttons and links. */
const ring = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-xyvoo-blue";

/** Tidies what the owner types without fighting them: a trailing hyphen stays until they type the next part. */
function normaliseAddress(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+/, "")
    .slice(0, 63);
}

function LoadingCards() {
  return (
    <div className="space-y-6" aria-hidden>
      {[0, 1].map((i) => (
        <div key={i} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 animate-pulse rounded-xl bg-slate-100 motion-reduce:animate-none" />
            <div className="h-4 w-40 animate-pulse rounded bg-slate-100 motion-reduce:animate-none" />
          </div>
          <div className="mt-5 h-11 animate-pulse rounded-xl bg-slate-100 motion-reduce:animate-none" />
        </div>
      ))}
    </div>
  );
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

  if (!domain) {
    return error ? (
      <DashAlert message={error} />
    ) : (
      <>
        <p className="sr-only" role="status">
          Loading your web address
        </p>
        <LoadingCards />
      </>
    );
  }

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
      {justChanged ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
          <DashStatus message="Your web address has changed. Links to your old address will forward here for 90 days." />
        </div>
      ) : null}

      <DashCard id="domain-current" icon={Globe} title="Your shop’s address" description="The link customers use to visit your shop. Share it anywhere.">
        <p className="break-all rounded-xl bg-slate-50 px-4 py-3 font-mono text-sm text-slate-900">{domain.url}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" onClick={copy} className={`${dashButton.primary} ${ring}`}>
            {copied ? <Check className="h-4 w-4" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
            {copied ? "Copied" : "Copy link"}
          </button>
          <a href={domain.url} target="_blank" rel="noreferrer" className={`${dashButton.secondary} ${ring}`}>
            Visit your shop <ExternalLink className="h-3.5 w-3.5" aria-hidden />
            <span className="sr-only">(opens in a new tab)</span>
          </a>
        </div>
        <p className="sr-only" role="status">
          {copied ? "Link copied" : ""}
        </p>
      </DashCard>

      <DashCard
        id="domain-change"
        icon={PencilLine}
        title="Change your address"
        description="Choose a new link for your shop. The old one keeps working for 90 days."
        actions={
          domain.canManage ? (
            <DashPill tone={domain.changesLeft > 0 ? "slate" : "amber"}>
              {domain.changesLeft === 0 ? "No changes left for now" : `${domain.changesLeft} ${domain.changesLeft === 1 ? "change" : "changes"} left`}
            </DashPill>
          ) : null
        }
      >
        <p className="text-sm text-slate-600">
          Links to your current address will forward customers to the new one for 90 days. Before then, update anywhere you&rsquo;ve shared it, such as
          social media profiles and printed materials.
        </p>

        {!domain.canManage ? (
          <p className="mt-4 rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-700">Only the shop&rsquo;s owner or an admin can change the address.</p>
        ) : domain.changesLeft === 0 ? (
          <p className="mt-4 rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-700">
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
              <div className="flex min-w-0 items-stretch">
                <input
                  id="domain-new"
                  className={`${dashInput} min-w-0 rounded-r-none`}
                  value={candidate}
                  onChange={(e) => onCandidate(e.target.value)}
                  autoComplete="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  maxLength={63}
                  aria-describedby="domain-new-hint domain-new-availability"
                  aria-invalid={availability.state === "taken"}
                />
                <span className="flex shrink-0 items-center rounded-r-xl border border-l-0 border-slate-300 bg-slate-50 px-3 text-sm text-slate-600">
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
                  <button type="button" onClick={change} disabled={busy} className={`${dashButton.primary} ${ring}`}>
                    {busy ? "Changing…" : "Yes, change my address"}
                  </button>
                  <button type="button" onClick={() => setConfirming(false)} disabled={busy} className={`${dashButton.secondary} ${ring}`}>
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button type="submit" disabled={!ready} className={`${dashButton.primary} ${ring}`}>
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
      </DashCard>

      {domain.previous.length ? (
        <DashCard id="domain-previous" icon={History} title="Old addresses still forwarding" description="Customers who use these links are taken to your current address.">
          <ul className="divide-y divide-slate-100 text-sm">
            {domain.previous.map((p) => (
              <li key={p.slug} className="flex flex-wrap justify-between gap-2 py-2.5">
                <span className="break-all font-mono text-slate-800">
                  {p.slug}.{STOREFRONT_ROOT_DOMAIN}
                </span>
                <span className="text-slate-600">Forwards until {new Date(p.expiresAt).toLocaleDateString("en-GB", dateFormat)}</span>
              </li>
            ))}
          </ul>
        </DashCard>
      ) : null}
    </div>
  );
}

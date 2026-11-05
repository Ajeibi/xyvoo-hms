"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Download, Layers, Plus, Trash2 } from "lucide-react";
import { toastError, toastSuccess } from "@/lib/app-toast";
import { HmsCard, HmsField, HmsPage, HmsPageHeader, HmsPill, hmsButton, hmsInput } from "@/components/hms/hms-ui";
import { HmsSectionIntro } from "@/components/hms/hms-ui-client";
import { GuestsNav } from "@/components/hms/guests/GuestsNav";
import { SendOfferCard } from "@/components/hms/guests/SendOfferCard";
import type { CampaignRecord } from "@/lib/hms/guest-campaigns";
import type { SegmentSummary } from "@/lib/hms/guest-segments";
import type { SegmentRules } from "@/lib/hms/guest-segments-shared";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

type Draft = {
  name: string;
  vip: boolean;
  minStays: string;
  maxStays: string;
  minSpend: string;
  maxSpend: string;
  lastStayWithinDays: string;
  lastStayOlderThanDays: string;
  nationality: string;
  birthdayMonth: string;
  hasCompany: boolean;
  consent: string;
  tier: string;
  neverStayed: boolean;
};

const EMPTY: Draft = {
  name: "",
  vip: false,
  minStays: "",
  maxStays: "",
  minSpend: "",
  maxSpend: "",
  lastStayWithinDays: "",
  lastStayOlderThanDays: "",
  nationality: "",
  birthdayMonth: "",
  hasCompany: false,
  consent: "",
  tier: "",
  neverStayed: false,
};

function toRules(d: Draft): SegmentRules {
  const num = (s: string) => (s.trim() !== "" && Number.isFinite(Number(s)) ? Number(s) : undefined);
  const rules: SegmentRules = {};
  if (d.vip) rules.vip = true;
  const set = <K extends keyof SegmentRules>(k: K, v: SegmentRules[K] | undefined) => {
    if (v !== undefined) rules[k] = v;
  };
  set("minStays", num(d.minStays));
  set("maxStays", num(d.maxStays));
  set("minSpend", num(d.minSpend));
  set("maxSpend", num(d.maxSpend));
  set("lastStayWithinDays", num(d.lastStayWithinDays));
  set("lastStayOlderThanDays", num(d.lastStayOlderThanDays));
  if (d.nationality) rules.nationality = d.nationality;
  if (d.birthdayMonth) rules.birthdayMonth = d.birthdayMonth === "this" ? "this" : Number(d.birthdayMonth);
  if (d.hasCompany) rules.hasCompany = true;
  if (d.consent) rules.consent = d.consent as SegmentRules["consent"];
  if (d.tier) rules.tier = d.tier;
  if (d.neverStayed) rules.neverStayed = true;
  return rules;
}

export function GuestSegmentsClient({
  slug,
  segments,
  totalGuests,
  canEdit,
  tierNames,
  canSend,
  sendOptions,
  campaigns,
}: {
  slug: string;
  segments: SegmentSummary[];
  totalGuests: number;
  canEdit: boolean;
  tierNames: string[];
  canSend: boolean;
  sendOptions: { key: string; label: string; emailable: number }[];
  campaigns: CampaignRecord[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [d, setD] = useState<Draft>(EMPTY);
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((p) => ({ ...p, [k]: v }));
  const exportHref = (key: string | null, consent?: string) =>
    `/api/hotel/guests/segments/export?slug=${encodeURIComponent(slug)}${key ? `&segment=${encodeURIComponent(key)}` : ""}${consent ? `&consent=${consent}` : ""}`;

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch("/api/hotel/guests/segments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, name: d.name, rules: toRules(d) }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return toastError("Could not save the segment", data.error ?? "Try again.");
      toastSuccess("Segment saved");
      setOpen(false);
      setD(EMPTY);
      router.refresh();
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    if (!window.confirm("Delete this segment? The guests in it are not affected.")) return;
    const res = await fetch(`/api/hotel/guests/segments?slug=${encodeURIComponent(slug)}&id=${id}`, { method: "DELETE" });
    if (!res.ok) return toastError("Could not delete the segment");
    toastSuccess("Segment deleted");
    router.refresh();
  };

  return (
    <HmsPage wide>
      <GuestsNav slug={slug} />
      <HmsPageHeader
        eyebrow="Guests"
        meaning="guests"
        title="Guest segments"
        description="Groups of guests picked by rules, like VIPs or people who haven't been back for a year."
        actions={
          canEdit ? (
            <button type="button" className={hmsButton.primary} onClick={() => setOpen((o) => !o)} aria-expanded={open}>
              <Plus className="h-4 w-4" aria-hidden />
              Build a segment
            </button>
          ) : undefined
        }
      />

      <HmsSectionIntro
        id="guest-segments"
        meaning="guests"
        art="people"
        title="Reach the right guests"
        points={[
          "Each group updates by itself as guests stay, spend and change their details.",
          "Download a group as a spreadsheet, or email it an offer. Offers only reach people who agreed to email, because the law says you may only market to people who said yes.",
        ]}
      />

      {open ? (
        <HmsCard id="segment-builder" icon={Layers} meaning="guests" title="Build a segment" description="Fill in only the rules you need. Guests must match all of them.">
          <form onSubmit={save} className="grid grid-cols-1 gap-4 sm:grid-cols-6" aria-label="Build a segment">
            <div className="sm:col-span-6">
              <HmsField id="seg-name" label="Name">
                <input id="seg-name" className={hmsInput} required value={d.name} onChange={(e) => set("name", e.target.value)} placeholder="Weekend regulars" />
              </HmsField>
            </div>
            <div className="sm:col-span-3">
              <HmsField id="seg-min-stays" label="At least this many stays" optional>
                <input id="seg-min-stays" type="number" min={0} className={hmsInput} value={d.minStays} onChange={(e) => set("minStays", e.target.value)} />
              </HmsField>
            </div>
            <div className="sm:col-span-3">
              <HmsField id="seg-max-stays" label="No more than this many stays" optional>
                <input id="seg-max-stays" type="number" min={0} className={hmsInput} value={d.maxStays} onChange={(e) => set("maxStays", e.target.value)} />
              </HmsField>
            </div>
            <div className="sm:col-span-3">
              <HmsField id="seg-min-spend" label="Spent at least" optional>
                <input id="seg-min-spend" type="number" min={0} className={hmsInput} value={d.minSpend} onChange={(e) => set("minSpend", e.target.value)} />
              </HmsField>
            </div>
            <div className="sm:col-span-3">
              <HmsField id="seg-max-spend" label="Spent no more than" optional>
                <input id="seg-max-spend" type="number" min={0} className={hmsInput} value={d.maxSpend} onChange={(e) => set("maxSpend", e.target.value)} />
              </HmsField>
            </div>
            <div className="sm:col-span-3">
              <HmsField id="seg-within" label="Stayed in the last (days)" optional>
                <input id="seg-within" type="number" min={0} className={hmsInput} value={d.lastStayWithinDays} onChange={(e) => set("lastStayWithinDays", e.target.value)} />
              </HmsField>
            </div>
            <div className="sm:col-span-3">
              <HmsField id="seg-older" label="Not back for more than (days)" optional>
                <input id="seg-older" type="number" min={0} className={hmsInput} value={d.lastStayOlderThanDays} onChange={(e) => set("lastStayOlderThanDays", e.target.value)} />
              </HmsField>
            </div>
            <div className="sm:col-span-2">
              <HmsField id="seg-nat" label="Where from" optional>
                <select id="seg-nat" className={hmsInput} value={d.nationality} onChange={(e) => set("nationality", e.target.value)}>
                  <option value="">Anywhere</option>
                  <option value="NG">Nigeria</option>
                  <option value="foreign">Abroad</option>
                </select>
              </HmsField>
            </div>
            <div className="sm:col-span-2">
              <HmsField id="seg-bday" label="Birthday" optional>
                <select id="seg-bday" className={hmsInput} value={d.birthdayMonth} onChange={(e) => set("birthdayMonth", e.target.value)}>
                  <option value="">Any time</option>
                  <option value="this">This month</option>
                  {MONTHS.map((m, i) => (
                    <option key={m} value={i + 1}>
                      {m}
                    </option>
                  ))}
                </select>
              </HmsField>
            </div>
            <div className="sm:col-span-2">
              <HmsField id="seg-consent" label="Agreed to offers" optional>
                <select id="seg-consent" className={hmsInput} value={d.consent} onChange={(e) => set("consent", e.target.value)}>
                  <option value="">Doesn&apos;t matter</option>
                  <option value="any">On any channel</option>
                  <option value="email">By email</option>
                  <option value="sms">By SMS</option>
                  <option value="whatsapp">By WhatsApp</option>
                </select>
              </HmsField>
            </div>
            {tierNames.length > 0 ? (
              <div className="sm:col-span-2">
                <HmsField id="seg-tier" label="Loyalty tier" optional>
                  <select id="seg-tier" className={hmsInput} value={d.tier} onChange={(e) => set("tier", e.target.value)}>
                    <option value="">Any</option>
                    {tierNames.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </HmsField>
              </div>
            ) : null}
            <fieldset className="sm:col-span-6 flex flex-wrap gap-x-6 gap-y-2">
              <legend className="sr-only">Other rules</legend>
              {(
                [
                  ["vip", "VIP guests only"],
                  ["hasCompany", "Linked to a company"],
                  ["neverStayed", "Never stayed"],
                ] as const
              ).map(([k, label]) => (
                <label key={k} className="flex items-center gap-2 text-sm text-slate-800">
                  <input type="checkbox" className="h-4 w-4" checked={d[k]} onChange={(e) => set(k, e.target.checked)} />
                  {label}
                </label>
              ))}
            </fieldset>
            <div className="sm:col-span-6 flex justify-end gap-2">
              <button type="button" className={hmsButton.secondary} onClick={() => setOpen(false)}>
                Cancel
              </button>
              <button type="submit" className={hmsButton.primary} disabled={saving}>
                {saving ? "Saving…" : "Save segment"}
              </button>
            </div>
          </form>
        </HmsCard>
      ) : null}

      <HmsCard
        id="segments-list"
        icon={Layers}
        meaning="guests"
        title="Your segments"
        description={`${totalGuests.toLocaleString("en-NG")} guests on record.`}
        actions={
          <a className={`${hmsButton.small} w-full sm:w-auto`} href={exportHref(null)} download>
            <Download className="h-4 w-4" aria-hidden />
            Download all guests
          </a>
        }
        flush
      >
        <ul className="divide-y divide-slate-100">
          {segments.map((s) => (
            <li key={s.key} className="flex flex-col gap-4 px-4 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex min-w-0 items-start justify-between gap-3 lg:flex-1">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 font-semibold text-slate-900">
                    {s.label}
                    {s.builtIn ? null : <HmsPill tone="blue">Yours</HmsPill>}
                  </p>
                  <p className="mt-0.5 text-sm text-slate-600">{s.description}</p>
                </div>
                <span className="shrink-0 rounded-xl bg-amber-50 px-3 py-1.5 text-center text-xl font-semibold tabular-nums text-slate-900 ring-1 ring-amber-100">
                  {s.count.toLocaleString("en-NG")}
                  <span className="sr-only"> guests</span>
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center *:w-full sm:*:w-auto">
                <Link className={hmsButton.small} href={`/hms/${slug}/guests?segment=${encodeURIComponent(s.key)}`}>
                  View<span className="sr-only"> {s.label}</span>
                </Link>
                {canEdit ? (
                  <>
                    <a className={hmsButton.small} href={exportHref(s.key)} download aria-label={`Download everyone in ${s.label}`}>
                      <Download className="h-4 w-4" aria-hidden />
                      All
                    </a>
                    <a
                      className={`${hmsButton.small} col-span-2`}
                      href={exportHref(s.key, "any")}
                      download
                      aria-label={`Download only the people in ${s.label} who agreed to offers`}
                    >
                      <Download className="h-4 w-4" aria-hidden />
                      Only those who agreed
                    </a>
                  </>
                ) : null}
                {canEdit && s.id ? (
                  <button
                    type="button"
                    className={`${hmsButton.danger} col-span-2 border border-red-100 sm:border-0`}
                    onClick={() => remove(s.id as string)}
                    aria-label={`Delete ${s.label}`}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden />
                    <span className="sm:hidden">Delete</span>
                  </button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      </HmsCard>

      {canSend ? <SendOfferCard slug={slug} options={sendOptions} recent={campaigns} /> : null}
    </HmsPage>
  );
}

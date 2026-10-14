"use client";

import { useEffect, useId, useState } from "react";
import { ArrowDown, ArrowUp, Eye, Mail, MailOpen, MousePointerClick, Plus, Search, Send, Trash2, Users } from "lucide-react";
import { formatShopCurrency } from "@/lib/shop/format";
import { CAMPAIGN_STATUS_LABELS, type CampaignAudience, type CampaignBlock, type CampaignStatus } from "@/lib/store/campaigns";
import { SEGMENT_LABELS, SEGMENTS } from "@/lib/store/customers";
import type { Campaign } from "@/lib/store/campaigns-server";
import { DashAlert, dashButton, DashCard, DashEmptyState, DashField, dashInput, DashPill, DashSectionIntro, DashStatStrip, DashStatTile, DashStatus, sendJson } from "./dashboard-ui";

const focusRing = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-xyvoo-blue focus-visible:ring-offset-2";

type Group = { id: string; name: string };
type Loaded = { campaigns: Campaign[]; groups: Group[]; subscribers: number; dailyLimit: number; currency: string; productNames: Record<string, string> };
type Product = { id: string; name: string; sellingPrice: number; status: string };

type EditableBlock = { key: string; block: CampaignBlock };
type Draft = { id: string | null; subject: string; previewText: string; blocks: EditableBlock[]; audience: string; scheduleAt: string };

const STATUS_TONE: Record<CampaignStatus, "slate" | "green" | "amber" | "red" | "blue"> = { draft: "slate", scheduled: "blue", sending: "amber", sent: "green", cancelled: "red" };

let counter = 0;
const nextKey = () => `b${(counter += 1)}`;

const audienceValue = (a: CampaignAudience) => (a.type === "everyone" ? "everyone" : a.type === "segment" ? `segment:${a.key}` : `group:${a.id}`);
function parseAudience(v: string): CampaignAudience {
  if (v.startsWith("segment:")) return { type: "segment", key: v.slice(8) as (typeof SEGMENTS)[number] };
  if (v.startsWith("group:")) return { type: "group", id: v.slice(6) };
  return { type: "everyone" };
}

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "");

/** Dashboard → Email campaigns: write an email once, send it to customers who agreed to hear from the shop. */
export default function CampaignsManager({ slug }: { slug: string }) {
  const [data, setData] = useState<Loaded | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [names, setNames] = useState<Record<string, string>>({});

  const load = () =>
    fetch(`/api/store/campaigns?slug=${encodeURIComponent(slug)}`)
      .then(async (res) => ({ ok: res.ok, body: await res.json().catch(() => ({})) }))
      .then(({ ok, body }) => {
        if (!ok) return setError(typeof body.error === "string" ? body.error : "We couldn't load your campaigns.");
        setData(body);
        setNames((n) => ({ ...body.productNames, ...n }));
      })
      .catch(() => setError("We couldn't load your campaigns. Please refresh the page."));

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  const anySending = data?.campaigns.some((c) => c.status === "sending") ?? false;
  useEffect(() => {
    if (!anySending) return;
    const timer = window.setInterval(() => void load(), 5000);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anySending, slug]);

  if (!data) {
    return error ? (
      <DashAlert message={error} />
    ) : (
      <p className="text-sm text-slate-600" role="status">
        Loading your campaigns…
      </p>
    );
  }

  const sentCampaigns = data.campaigns.filter((c) => c.status === "sent" || c.status === "sending");
  const emailsSent = data.campaigns.reduce((s, c) => s + c.stats.sent, 0);

  const edit = (c: Campaign) =>
    setDraft({
      id: c.id,
      subject: c.subject,
      previewText: c.previewText ?? "",
      blocks: c.blocks.map((block) => ({ key: nextKey(), block })),
      audience: audienceValue(c.audience),
      scheduleAt: "",
    });
  const startNew = () =>
    setDraft({
      id: null,
      subject: "",
      previewText: "",
      blocks: [
        { key: nextKey(), block: { type: "heading", text: "" } },
        { key: nextKey(), block: { type: "text", text: "" } },
      ],
      audience: "everyone",
      scheduleAt: "",
    });

  const action = async (c: Campaign, what: "cancel" | "delete") => {
    setError("");
    setMessage("");
    try {
      if (what === "cancel") await sendJson(`/api/store/campaigns/${c.id}/cancel`, "POST", { slug });
      else await sendJson(`/api/store/campaigns/${c.id}?slug=${encodeURIComponent(slug)}`, "DELETE");
      setMessage(what === "cancel" ? "Campaign stopped. Anyone not yet emailed won't be." : "Campaign removed.");
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <div className="space-y-6">
      <DashSectionIntro
        id="campaigns"
        meaning="marketing"
        art="tag"
        title="Tell your customers what's new"
        points={[
          "Only people who ticked “Send me news and offers” at checkout or when creating an account, or joined your newsletter, can receive a campaign. Everyone can unsubscribe in one click.",
          "Write your message, add a button or products from your shop, send yourself a test, then send it now or schedule it.",
          "See how many people opened it and clicked through.",
        ]}
      />

      <DashStatStrip label="Email campaigns in figures" columns={3}>
        <DashStatTile label="People who agreed" meaning="customers" icon={Users} hint="Can receive your campaigns" value={String(data.subscribers)} />
        <DashStatTile label="Campaigns sent" meaning="marketing" icon={Mail} hint="Including any still sending" value={String(sentCampaigns.length)} />
        <DashStatTile label="Emails sent" meaning="orders" icon={Send} hint={`Up to ${data.dailyLimit.toLocaleString("en-GB")} a day`} value={String(emailsSent)} />
      </DashStatStrip>

      <DashAlert message={error} />
      <DashStatus message={message} />

      {draft ? (
        <CampaignEditor
          key={draft.id ?? "new"}
          slug={slug}
          initial={draft}
          groups={data.groups}
          currency={data.currency}
          names={names}
          rememberName={(id, name) => setNames((n) => ({ ...n, [id]: name }))}
          onCancel={() => setDraft(null)}
          onDone={async (text) => {
            setDraft(null);
            setMessage(text);
            await load();
          }}
        />
      ) : (
        <DashCard
          id="campaigns-list"
          icon={Mail}
          title="Your campaigns"
          description="Drafts, scheduled and sent emails."
          actions={
            <button type="button" onClick={startNew} className={`${dashButton.primary} ${focusRing}`}>
              <Plus className="h-4 w-4" aria-hidden /> New campaign
            </button>
          }
        >
          {data.campaigns.length === 0 ? (
            <DashEmptyState
              art="tag"
              meaning="marketing"
              title="No campaigns yet"
              description={data.subscribers ? `You have ${data.subscribers} ${data.subscribers === 1 ? "person" : "people"} who agreed to hear from you. Write your first campaign.` : "Customers can agree to hear from you at checkout, when they create an account, or through your newsletter. Once some have, you can write your first campaign here."}
            />
          ) : (
            <ul className="divide-y divide-slate-100">
              {data.campaigns.map((c) => (
                <li key={c.id} className="py-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="break-words font-medium text-slate-900">{c.subject}</p>
                      <p className="text-sm text-slate-600">
                        {c.status === "scheduled" && c.scheduledAt
                          ? `Goes out ${when(c.scheduledAt)}`
                          : c.finishedAt
                            ? `Finished ${when(c.finishedAt)}`
                            : c.startedAt
                              ? `Started ${when(c.startedAt)}`
                              : `Saved ${when(c.createdAt)}`}
                      </p>
                    </div>
                    <DashPill tone={STATUS_TONE[c.status]}>{CAMPAIGN_STATUS_LABELS[c.status]}</DashPill>
                  </div>
                  {c.stats.recipients > 0 ? (
                    <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-700">
                      <span>
                        <Send className="mr-1 inline h-4 w-4 text-slate-500" aria-hidden />
                        {c.stats.sent} of {c.stats.recipients} sent
                        {c.stats.failed ? `, ${c.stats.failed} couldn't be sent` : ""}
                      </span>
                      <span>
                        <MailOpen className="mr-1 inline h-4 w-4 text-slate-500" aria-hidden />
                        {c.rates.opened}% opened
                      </span>
                      <span>
                        <MousePointerClick className="mr-1 inline h-4 w-4 text-slate-500" aria-hidden />
                        {c.rates.clicked}% clicked
                      </span>
                      <span>{c.stats.unsubscribed} unsubscribed</span>
                    </p>
                  ) : null}
                  <div className="mt-2 flex flex-wrap gap-2">
                    {c.status === "draft" || c.status === "scheduled" ? (
                      <button type="button" onClick={() => edit(c)} className={`${dashButton.secondary} ${focusRing}`}>
                        {c.status === "draft" ? "Edit" : "Change"}
                        <span className="sr-only"> {c.subject}</span>
                      </button>
                    ) : null}
                    {c.status === "scheduled" || c.status === "sending" ? (
                      <button type="button" onClick={() => action(c, "cancel")} className={`${dashButton.danger} ${focusRing}`}>
                        Stop<span className="sr-only"> {c.subject}</span>
                      </button>
                    ) : null}
                    {c.status !== "sending" ? (
                      <button type="button" onClick={() => action(c, "delete")} className={`${dashButton.quiet} ${focusRing}`}>
                        <Trash2 className="h-4 w-4" aria-hidden /> Remove<span className="sr-only"> {c.subject}</span>
                      </button>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-4 text-xs text-slate-500">
            Opens are approximate: some email apps hide the picture we use to count them, so the real number is usually a little higher.
          </p>
        </DashCard>
      )}
    </div>
  );
}

function CampaignEditor({
  slug,
  initial,
  groups,
  currency,
  names,
  rememberName,
  onCancel,
  onDone,
}: {
  slug: string;
  initial: Draft;
  groups: Group[];
  currency: string;
  names: Record<string, string>;
  rememberName: (id: string, name: string) => void;
  onCancel: () => void;
  onDone: (message: string) => Promise<void>;
}) {
  const id = useId();
  const [d, setD] = useState<Draft>(initial);
  const [busy, setBusy] = useState<"" | "save" | "test" | "send" | "schedule">("");
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [confirmSend, setConfirmSend] = useState(false);
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<Product[]>([]);

  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) return;
    const timer = window.setTimeout(() => {
      fetch(`/api/store/products/list?slug=${encodeURIComponent(slug)}&page=1&q=${encodeURIComponent(term)}`)
        .then((res) => res.json())
        .then((body) => setMatches(((body.products || []) as Product[]).filter((p) => p.status === "active").slice(0, 6)))
        .catch(() => setMatches([]));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [query, slug]);

  const setBlock = (key: string, patch: Partial<CampaignBlock>) => setD((s) => ({ ...s, blocks: s.blocks.map((b) => (b.key === key ? { ...b, block: { ...b.block, ...patch } as CampaignBlock } : b)) }));
  const move = (index: number, by: -1 | 1) =>
    setD((s) => {
      const to = index + by;
      if (to < 0 || to >= s.blocks.length) return s;
      const list = [...s.blocks];
      [list[index], list[to]] = [list[to], list[index]];
      return { ...s, blocks: list };
    });
  const add = (block: CampaignBlock) => setD((s) => ({ ...s, blocks: [...s.blocks, { key: nextKey(), block }] }));

  const body = () => ({
    slug,
    subject: d.subject,
    previewText: d.previewText,
    blocks: d.blocks.map((b) => b.block),
    audience: parseAudience(d.audience),
  });

  /** Saves the draft and returns its id. */
  const save = async () => {
    const data = d.id ? await sendJson(`/api/store/campaigns/${d.id}`, "PUT", body()) : await sendJson("/api/store/campaigns", "POST", body());
    const savedId = data.campaign.id as string;
    setD((s) => ({ ...s, id: savedId }));
    return savedId;
  };

  const run = async (which: typeof busy, fn: () => Promise<void>) => {
    setBusy(which);
    setError("");
    setNote("");
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  };

  const saveDraft = () =>
    run("save", async () => {
      await save();
      await onDone("Draft saved.");
    });
  const sendTest = () =>
    run("test", async () => {
      const savedId = await save();
      const res = await sendJson(`/api/store/campaigns/${savedId}/test`, "POST", { slug });
      setNote(`A test has been sent to ${res.sentTo}. Check your inbox (and spam folder).`);
    });
  const sendNow = () =>
    run("send", async () => {
      const savedId = await save();
      const res = await sendJson(`/api/store/campaigns/${savedId}/send`, "POST", { slug });
      await onDone(`Sending to ${res.recipients} ${res.recipients === 1 ? "person" : "people"}. You can leave this page; the rest go out in the background.`);
    });
  const schedule = () =>
    run("schedule", async () => {
      if (!d.scheduleAt) throw new Error("Choose a date and time to send it.");
      const savedId = await save();
      const res = await sendJson(`/api/store/campaigns/${savedId}/send`, "POST", { slug, scheduledAt: new Date(d.scheduleAt).toISOString() });
      await onDone(`Scheduled for ${when(new Date(d.scheduleAt).toISOString())}, to ${res.recipients} ${res.recipients === 1 ? "person" : "people"}.`);
    });

  const money = (n: number) => formatShopCurrency(n, currency);

  return (
    <DashCard id="campaign-editor" icon={Mail} title={initial.id ? "Change this campaign" : "New campaign"} description="Write it, send yourself a test, then send it to your customers.">
      <div className="space-y-6">
        <DashAlert message={error} />
        <DashStatus message={note} />

        <div className="grid gap-4 sm:grid-cols-2">
          <DashField id={`${id}-subject`} label="Subject line" hint="What people see first in their inbox.">
            <input id={`${id}-subject`} className={dashInput} value={d.subject} maxLength={150} onChange={(e) => setD({ ...d, subject: e.target.value })} aria-describedby={`${id}-subject-hint`} autoComplete="off" />
          </DashField>
          <DashField id={`${id}-preview`} label="Preview" optional hint="A short line shown after the subject in some inboxes.">
            <input id={`${id}-preview`} className={dashInput} value={d.previewText} maxLength={200} onChange={(e) => setD({ ...d, previewText: e.target.value })} aria-describedby={`${id}-preview-hint`} autoComplete="off" />
          </DashField>
          <DashField id={`${id}-audience`} label="Who should get it?" hint="Only people who agreed to hear from you are ever emailed.">
            <select id={`${id}-audience`} className={dashInput} value={d.audience} onChange={(e) => setD({ ...d, audience: e.target.value })} aria-describedby={`${id}-audience-hint`}>
              <option value="everyone">Everyone who agreed</option>
              <optgroup label="Automatic groups">
                {SEGMENTS.map((s) => (
                  <option key={s} value={`segment:${s}`}>
                    {SEGMENT_LABELS[s]} customers
                  </option>
                ))}
              </optgroup>
              {groups.length ? (
                <optgroup label="Your own groups">
                  {groups.map((g) => (
                    <option key={g.id} value={`group:${g.id}`}>
                      {g.name}
                    </option>
                  ))}
                </optgroup>
              ) : null}
            </select>
          </DashField>
        </div>

        <fieldset className="space-y-3">
          <legend className="text-sm font-semibold text-slate-900">What it says</legend>
          <ul className="space-y-3">
            {d.blocks.map(({ key, block }, i) => (
              <li key={key} className="rounded-xl border border-slate-200 p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-sm font-medium text-slate-700">
                    {block.type === "heading" ? "Heading" : block.type === "text" ? "Paragraph" : block.type === "button" ? "Button" : "Product"} {i + 1}
                  </p>
                  <div className="flex gap-1">
                    <button type="button" onClick={() => move(i, -1)} disabled={i === 0} className={`${dashButton.quiet} ${focusRing}`}>
                      <ArrowUp className="h-4 w-4" aria-hidden />
                      <span className="sr-only">Move block {i + 1} up</span>
                    </button>
                    <button type="button" onClick={() => move(i, 1)} disabled={i === d.blocks.length - 1} className={`${dashButton.quiet} ${focusRing}`}>
                      <ArrowDown className="h-4 w-4" aria-hidden />
                      <span className="sr-only">Move block {i + 1} down</span>
                    </button>
                    <button type="button" onClick={() => setD((s) => ({ ...s, blocks: s.blocks.filter((b) => b.key !== key) }))} className={`${dashButton.danger} ${focusRing}`}>
                      <Trash2 className="h-4 w-4" aria-hidden />
                      <span className="sr-only">Remove block {i + 1}</span>
                    </button>
                  </div>
                </div>
                {block.type === "heading" ? (
                  <input aria-label={`Heading ${i + 1}`} className={dashInput} value={block.text} maxLength={120} onChange={(e) => setBlock(key, { text: e.target.value })} placeholder="A short heading" />
                ) : block.type === "text" ? (
                  <textarea aria-label={`Paragraph ${i + 1}`} className={`${dashInput} min-h-28`} value={block.text} maxLength={2000} onChange={(e) => setBlock(key, { text: e.target.value })} placeholder="Write your message" />
                ) : block.type === "button" ? (
                  <div className="grid gap-2 sm:grid-cols-2">
                    <input aria-label={`Button ${i + 1} words`} className={dashInput} value={block.label} maxLength={40} onChange={(e) => setBlock(key, { label: e.target.value })} placeholder="Words on the button, e.g. Shop now" />
                    <input aria-label={`Button ${i + 1} link`} className={dashInput} value={block.url} maxLength={500} onChange={(e) => setBlock(key, { url: e.target.value })} placeholder="/products or https://…" />
                  </div>
                ) : (
                  <p className="text-sm text-slate-800">{names[block.productId] || "A product from your shop"}</p>
                )}
              </li>
            ))}
          </ul>

          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => add({ type: "heading", text: "" })} className={`${dashButton.secondary} ${focusRing}`}>
              <Plus className="h-4 w-4" aria-hidden /> Heading
            </button>
            <button type="button" onClick={() => add({ type: "text", text: "" })} className={`${dashButton.secondary} ${focusRing}`}>
              <Plus className="h-4 w-4" aria-hidden /> Paragraph
            </button>
            <button type="button" onClick={() => add({ type: "button", label: "", url: "/products" })} className={`${dashButton.secondary} ${focusRing}`}>
              <Plus className="h-4 w-4" aria-hidden /> Button
            </button>
          </div>

          <div className="rounded-xl bg-slate-50 p-3">
            <label htmlFor={`${id}-find`} className="text-sm font-medium text-slate-800">
              Add a product
            </label>
            <div className="relative mt-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
              <input id={`${id}-find`} className={`${dashInput} pl-9`} placeholder="Find a product by name" value={query} onChange={(e) => setQuery(e.target.value)} autoComplete="off" />
            </div>
            {query.trim().length >= 2 && matches.length ? (
              <ul className="mt-2 divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white" aria-label="Matching products">
                {matches.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-3 px-3 py-2">
                    <span className="min-w-0 truncate text-sm text-slate-800">
                      {p.name} <span className="text-slate-500">· {money(p.sellingPrice)}</span>
                    </span>
                    <button
                      type="button"
                      className={`${dashButton.quiet} ${focusRing}`}
                      onClick={() => {
                        rememberName(p.id, p.name);
                        add({ type: "product", productId: p.id });
                        setQuery("");
                        setMatches([]);
                      }}
                    >
                      <Plus className="h-4 w-4" aria-hidden /> Add<span className="sr-only"> {p.name}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </fieldset>

        <div className="space-y-3 border-t border-slate-100 pt-5">
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" onClick={saveDraft} disabled={Boolean(busy)} className={`${dashButton.secondary} ${focusRing}`}>
              {busy === "save" ? "Saving…" : "Save draft"}
            </button>
            <button type="button" onClick={sendTest} disabled={Boolean(busy)} className={`${dashButton.secondary} ${focusRing}`}>
              <Eye className="h-4 w-4" aria-hidden /> {busy === "test" ? "Sending a test…" : "Send me a test"}
            </button>
            <button type="button" onClick={onCancel} disabled={Boolean(busy)} className={`${dashButton.quiet} ${focusRing}`}>
              Close without saving
            </button>
          </div>

          <div className="grid gap-3 rounded-xl border border-slate-200 p-4 sm:grid-cols-2">
            <div className="space-y-2">
              <p className="text-sm font-semibold text-slate-900">Send it now</p>
              {confirmSend ? (
                <div className="space-y-2" role="alert">
                  <p className="text-sm text-slate-700">This emails everyone in the audience you chose who agreed to hear from you. You can&rsquo;t take back emails already sent.</p>
                  <div className="flex gap-2">
                    <button type="button" onClick={sendNow} disabled={Boolean(busy)} className={`${dashButton.primary} ${focusRing}`}>
                      <Send className="h-4 w-4" aria-hidden /> {busy === "send" ? "Sending…" : "Yes, send it"}
                    </button>
                    <button type="button" onClick={() => setConfirmSend(false)} className={`${dashButton.secondary} ${focusRing}`}>
                      Not yet
                    </button>
                  </div>
                </div>
              ) : (
                <button type="button" onClick={() => setConfirmSend(true)} disabled={Boolean(busy)} className={`${dashButton.primary} ${focusRing}`}>
                  <Send className="h-4 w-4" aria-hidden /> Send now
                </button>
              )}
            </div>
            <div className="space-y-2">
              <label htmlFor={`${id}-when`} className="text-sm font-semibold text-slate-900">
                Or send it later
              </label>
              <input id={`${id}-when`} type="datetime-local" className={dashInput} value={d.scheduleAt} onChange={(e) => setD({ ...d, scheduleAt: e.target.value })} />
              <button type="button" onClick={schedule} disabled={Boolean(busy)} className={`${dashButton.secondary} ${focusRing}`}>
                {busy === "schedule" ? "Scheduling…" : "Schedule it"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </DashCard>
  );
}

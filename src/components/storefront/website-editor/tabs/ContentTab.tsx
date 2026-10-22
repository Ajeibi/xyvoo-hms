"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { DashAlert, DashField, dashInput } from "../../dashboard-ui";
import type { TabProps } from "../WebsiteEditor";

const okHref = (href: string | null) => !href || href.startsWith("/") || /^https:\/\//.test(href);

/** ISO time <-> the value of a datetime-local input, in the merchant's own time zone. */
function toLocalInput(iso: string | null | undefined) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}
const fromLocalInput = (value: string) => (value ? new Date(value).toISOString() : null);

/** Shop-wide words: announcement bar, footer and the headings of the product and collection pages. */
export default function ContentTab({ state, saving, saveDraft }: TabProps) {
  const [content, setContent] = useState(state.resolved.content);
  const [problem, setProblem] = useState("");

  const field = (id: string, label: string, value: string, onChange: (v: string) => void, opts: { max: number; hint?: string; multiline?: boolean }) => (
    <DashField id={id} label={label} hint={opts.hint}>
      {opts.multiline ? (
        <textarea id={id} className={dashInput} rows={3} maxLength={opts.max} value={value} onChange={(e) => onChange(e.target.value)} aria-describedby={opts.hint ? `${id}-hint` : undefined} />
      ) : (
        <input id={id} className={dashInput} maxLength={opts.max} value={value} onChange={(e) => onChange(e.target.value)} aria-describedby={opts.hint ? `${id}-hint` : undefined} />
      )}
    </DashField>
  );

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    const { announcement } = content;
    const href = announcement.href?.trim() || null;
    const more = (announcement.more ?? []).map((m) => ({ text: m.text.trim(), href: m.href?.trim() || null }));
    if (!okHref(href) || more.some((m) => !okHref(m.href))) {
      setProblem("Announcement links must start with / (a page in your shop) or https://.");
      return;
    }
    if (more.some((m) => !m.text)) {
      setProblem("Every extra announcement message needs some words, or remove it.");
      return;
    }
    if (announcement.startsAt && announcement.endsAt && announcement.endsAt <= announcement.startsAt) {
      setProblem("The announcement must stop showing after it starts.");
      return;
    }
    setProblem("");
    void saveDraft({ patch: { content: { ...content, announcement: { ...announcement, href, more } } } });
  };

  return (
    <form onSubmit={save} className="space-y-6" noValidate>
      <DashAlert message={problem} />
      <section aria-labelledby="announce-title" className="space-y-3">
        <h2 id="announce-title" className="text-base font-semibold text-slate-900">
          Announcement bar
        </h2>
        {field("content-announce", "Message", content.announcement.text, (text) => setContent({ ...content, announcement: { ...content.announcement, text } }), {
          max: 120,
          hint: "Shown across the top of every page. Leave empty to hide it.",
        })}
        {field("content-announce-link", "Link (optional)", content.announcement.href ?? "", (href) => setContent({ ...content, announcement: { ...content.announcement, href } }), {
          max: 500,
          hint: "e.g. /products or /pages/delivery-returns",
        })}
        {(content.announcement.more ?? []).map((m, i) => {
          const setMore = (next: { text: string; href: string | null } | null) =>
            setContent({
              ...content,
              announcement: {
                ...content.announcement,
                more: (content.announcement.more ?? []).flatMap((x, j) => (j !== i ? [x] : next ? [next] : [])),
              },
            });
          return (
            <fieldset key={i} className="space-y-2 rounded-xl border border-slate-200 p-3">
              <legend className="px-1 text-sm font-medium text-slate-800">Message {i + 2}</legend>
              {field(`content-announce-${i}`, "Message", m.text, (text) => setMore({ ...m, text }), { max: 120 })}
              {field(`content-announce-${i}-link`, "Link (optional)", m.href ?? "", (href) => setMore({ ...m, href }), { max: 500 })}
              <button type="button" onClick={() => setMore(null)} className="inline-flex items-center gap-1 text-sm text-red-700 hover:underline">
                <Trash2 className="h-4 w-4" aria-hidden /> Remove message {i + 2}
              </button>
            </fieldset>
          );
        })}
        {content.announcement.text && (content.announcement.more?.length ?? 0) < 4 ? (
          <button
            type="button"
            onClick={() => setContent({ ...content, announcement: { ...content.announcement, more: [...(content.announcement.more ?? []), { text: "", href: null }] } })}
            className="inline-flex items-center gap-1 text-sm font-medium text-blue-700 hover:underline"
          >
            <Plus className="h-4 w-4" aria-hidden /> Add another message
          </button>
        ) : null}
        {content.announcement.more?.length ? <p className="text-xs text-slate-500">Messages take turns every few seconds. Shoppers can pause them, and they don&rsquo;t move for anyone who has asked their device for less motion.</p> : null}
        <label className="flex items-center gap-2 text-sm text-slate-800">
          <input type="checkbox" checked={Boolean(content.announcement.dismissible)} onChange={(e) => setContent({ ...content, announcement: { ...content.announcement, dismissible: e.target.checked } })} />
          Let shoppers close it (it stays closed for their visit)
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <DashField id="content-announce-start" label="Show from (optional)">
            <input
              id="content-announce-start"
              type="datetime-local"
              className={dashInput}
              value={toLocalInput(content.announcement.startsAt)}
              onChange={(e) => setContent({ ...content, announcement: { ...content.announcement, startsAt: fromLocalInput(e.target.value) } })}
            />
          </DashField>
          <DashField id="content-announce-end" label="Stop showing (optional)">
            <input
              id="content-announce-end"
              type="datetime-local"
              className={dashInput}
              value={toLocalInput(content.announcement.endsAt)}
              onChange={(e) => setContent({ ...content, announcement: { ...content.announcement, endsAt: fromLocalInput(e.target.value) } })}
            />
          </DashField>
        </div>
        <p className="text-xs text-slate-500">Handy for a sale: the bar appears and disappears on its own. Times are in your own time zone.</p>
      </section>

      <section aria-labelledby="footer-title" className="space-y-3">
        <h2 id="footer-title" className="text-base font-semibold text-slate-900">
          Footer
        </h2>
        {field("content-blurb", "About your shop", content.footerBlurb, (footerBlurb) => setContent({ ...content, footerBlurb }), { max: 300, multiline: true })}
        {field("content-copyright", "Copyright line", content.copyright, (copyright) => setContent({ ...content, copyright }), { max: 120 })}
      </section>

      <section aria-labelledby="shop-title" className="space-y-3">
        <h2 id="shop-title" className="text-base font-semibold text-slate-900">
          All products page
        </h2>
        {field("content-shop-title", "Page title", content.shop.title, (title) => setContent({ ...content, shop: { ...content.shop, title } }), { max: 80 })}
        {field("content-shop-lead", "Introduction", content.shop.lead, (lead) => setContent({ ...content, shop: { ...content.shop, lead } }), { max: 300, multiline: true })}
        {field("content-shop-desc", "Description for search engines", content.shop.description, (description) => setContent({ ...content, shop: { ...content.shop, description } }), {
          max: 300,
        })}
      </section>

      <button type="submit" disabled={saving} className="rounded-xl bg-xyvoo-blue px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
        {saving ? "Saving…" : "Save words"}
      </button>
    </form>
  );
}

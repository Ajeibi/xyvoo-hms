"use client";

import { useState } from "react";
import { DashAlert, DashField, dashInput } from "../../dashboard-ui";
import type { TabProps } from "../WebsiteEditor";

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
    const href = content.announcement.href?.trim() || null;
    if (href && !href.startsWith("/") && !/^https:\/\//.test(href)) {
      setProblem("The announcement link must start with / (a page in your shop) or https://.");
      return;
    }
    setProblem("");
    void saveDraft({ patch: { content: { ...content, announcement: { ...content.announcement, href } } } });
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

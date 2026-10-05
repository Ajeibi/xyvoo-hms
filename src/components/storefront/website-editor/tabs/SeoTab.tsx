"use client";

import { useState } from "react";
import { DashField, dashInput } from "../../dashboard-ui";
import ImagePicker from "../ImagePicker";
import type { TabProps } from "../WebsiteEditor";

/** How the shop appears in Google and when its link is shared. */
export default function SeoTab({ slug, state, saving, saveDraft }: TabProps) {
  const [seo, setSeo] = useState(state.resolved.seo);

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        // Analytics IDs aren't edited here yet: tracking needs a cookie consent banner first.
        void saveDraft({ patch: { seo: { ...seo, googleAnalyticsId: null, metaPixelId: null } } });
      }}
    >
      <DashField id="seo-title" label="Shop title in search results" hint={`${seo.title.length} of 70 characters. Usually your shop name and what you sell.`}>
        <input id="seo-title" className={dashInput} maxLength={70} value={seo.title} onChange={(e) => setSeo({ ...seo, title: e.target.value })} aria-describedby="seo-title-hint" />
      </DashField>
      <DashField id="seo-description" label="Description in search results" hint={`${seo.description.length} of 160 characters. One or two sentences that make people want to visit.`}>
        <textarea id="seo-description" className={dashInput} rows={3} maxLength={160} value={seo.description} onChange={(e) => setSeo({ ...seo, description: e.target.value })} aria-describedby="seo-description-hint" />
      </DashField>

      <div className="rounded-xl border border-slate-200 p-4" aria-label="Search result preview">
        <p className="text-xs text-slate-500">How it may look in Google</p>
        <p className="mt-1 truncate text-base text-blue-800">{seo.title || "Your shop title"}</p>
        <p className="line-clamp-2 text-sm text-slate-600">{seo.description || "Your description appears here."}</p>
      </div>

      <ImagePicker
        id="seo-share"
        label="Image shown when your shop's link is shared (WhatsApp, Facebook, X)"
        slug={slug}
        url={seo.shareImageUrl}
        onChange={(shareImageUrl) => setSeo({ ...seo, shareImageUrl })}
        decorative
      />

      <button type="submit" disabled={saving} className="rounded-xl bg-xyvoo-blue px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
        {saving ? "Saving…" : "Save search and sharing"}
      </button>
    </form>
  );
}

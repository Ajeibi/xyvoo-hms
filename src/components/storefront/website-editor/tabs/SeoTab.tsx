"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { DashAlert, DashField, dashButton, dashInput } from "../../dashboard-ui";
import ImagePicker from "../ImagePicker";
import type { TabProps } from "../WebsiteEditor";
import { PRODUCT_FEED_PATH } from "@/lib/store/product-feed";
import { storefrontUrl } from "@/lib/store/subdomain";

const META_PIXEL = /^[0-9]{6,20}$/;
const GOOGLE_ANALYTICS = /^G-[A-Z0-9]{4,12}$/;

/** How the shop appears in Google and when its link is shared, its ad tracking, and its product feed. */
export default function SeoTab({ slug, state, saving, saveDraft }: TabProps) {
  const [seo, setSeo] = useState(state.resolved.seo);
  const [metaPixelId, setMetaPixelId] = useState(seo.metaPixelId ?? "");
  const [googleAnalyticsId, setGoogleAnalyticsId] = useState(seo.googleAnalyticsId ?? "");
  const [error, setError] = useState("");

  const save = () => {
    const meta = metaPixelId.trim();
    const google = googleAnalyticsId.trim().toUpperCase();
    if (meta && !META_PIXEL.test(meta)) return setError("A Meta Pixel ID is the number in Events Manager, such as 1234567890123456.");
    if (google && !GOOGLE_ANALYTICS.test(google)) return setError("A Google Analytics ID starts with G-, such as G-AB12CD34EF.");
    setError("");
    setGoogleAnalyticsId(google);
    void saveDraft({ patch: { seo: { ...seo, metaPixelId: meta || null, googleAnalyticsId: google || null } } });
  };

  return (
    <div className="space-y-8">
      <form
        className="space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          save();
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

        <fieldset className="space-y-4 rounded-xl border border-slate-200 p-4">
          <legend className="px-1 text-sm font-semibold text-slate-900">Measure your adverts</legend>
          <p className="text-sm text-slate-600">
            Add your own Meta Pixel or Google Analytics to see which adverts bring sales. They only run for shoppers who accept cookies on your shop, and your cookie
            banner will name them.
          </p>
          <DashField id="seo-meta-pixel" label="Meta Pixel ID" optional hint="For Facebook and Instagram adverts. Find it in Meta Events Manager under Data sources.">
            <input
              id="seo-meta-pixel"
              className={dashInput}
              inputMode="numeric"
              autoComplete="off"
              maxLength={20}
              placeholder="1234567890123456"
              value={metaPixelId}
              onChange={(e) => setMetaPixelId(e.target.value.replace(/\s/g, ""))}
              aria-describedby="seo-meta-pixel-hint"
            />
          </DashField>
          <DashField id="seo-google-analytics" label="Google Analytics measurement ID" optional hint="Starts with G-. Find it in Google Analytics under Admin, Data streams.">
            <input
              id="seo-google-analytics"
              className={dashInput}
              autoComplete="off"
              autoCapitalize="characters"
              maxLength={14}
              placeholder="G-AB12CD34EF"
              value={googleAnalyticsId}
              onChange={(e) => setGoogleAnalyticsId(e.target.value.replace(/\s/g, ""))}
              aria-describedby="seo-google-analytics-hint"
            />
          </DashField>
        </fieldset>

        <DashAlert message={error} />

        <button type="submit" disabled={saving} className="rounded-xl bg-xyvoo-blue px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
          {saving ? "Saving…" : "Save search, sharing and adverts"}
        </button>
      </form>

      <ProductFeed slug={slug} live={state.status === "live"} />
    </div>
  );
}

/** The link Google Merchant Center and Meta Commerce Manager fetch the shop's products from. */
function ProductFeed({ slug, live }: { slug: string; live: boolean }) {
  const url = `${storefrontUrl(slug)}${PRODUCT_FEED_PATH}`;
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      setError("We couldn't copy the link. Please select it and copy it yourself.");
    }
  };

  return (
    <section className="space-y-3 rounded-xl border border-slate-200 p-4" aria-labelledby="product-feed-title">
      <h3 id="product-feed-title" className="text-sm font-semibold text-slate-900">
        Sell on Google, Facebook and Instagram
      </h3>
      <p className="text-sm text-slate-600">
        Your product feed lists every product on your shop, with its photos, price and stock, and stays up to date by itself. Give this link to Google Merchant
        Center or Meta Commerce Manager, and they&rsquo;ll check it for changes every day.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor="product-feed-url" className="sr-only">
          Product feed link
        </label>
        <input id="product-feed-url" className={`${dashInput} min-w-0 flex-1 font-mono text-xs`} readOnly value={url} onFocus={(e) => e.target.select()} />
        <button type="button" onClick={copy} className={dashButton.secondary}>
          {copied ? <Check className="h-4 w-4" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
          {copied ? "Copied" : "Copy link"}
        </button>
      </div>
      <span className="sr-only" role="status">
        {copied ? "Product feed link copied." : ""}
      </span>
      <DashAlert message={error} />
      {live ? null : <p className="text-sm text-amber-800">The feed starts working once your shop is published.</p>}
      <ul className="list-disc space-y-1 pl-5 text-sm text-slate-600">
        <li>
          <strong className="font-medium text-slate-800">Google:</strong> in Merchant Center, go to Products, then Add products, and choose to add them from a file
          link. Paste the link and pick a daily schedule.
        </li>
        <li>
          <strong className="font-medium text-slate-800">Facebook and Instagram:</strong> in Commerce Manager, open your catalogue, choose Data sources, then Data
          feed, and paste the link with a daily schedule.
        </li>
        <li>Products need a photo to be listed. Adding a barcode (GTIN) to each option helps them show up more.</li>
      </ul>
    </section>
  );
}

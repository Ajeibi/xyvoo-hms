"use client";

import { useCallback, useEffect, useState } from "react";
import { CircleCheck, Eye, ExternalLink, FileText, History, Home, Image as ImageIcon, LayoutTemplate, Menu, Monitor, Palette, Rocket, Search, Smartphone, Type } from "lucide-react";
import { MEANING, type Meaning } from "../meaning";
import type { EditorState } from "@/lib/store/site/editor-api";
import type { SiteOverrides } from "@/lib/store/site/schema";
import type { StorefrontTemplateSlug } from "@/lib/store/site/templates";
import { DashAlert, sendJson } from "../dashboard-ui";
import ContentTab from "./tabs/ContentTab";
import HomepageTab from "./tabs/HomepageTab";
import MediaTab from "./tabs/MediaTab";
import NavigationTab from "./tabs/NavigationTab";
import PagesTab from "./tabs/PagesTab";
import SeoTab from "./tabs/SeoTab";
import TemplateTab from "./tabs/TemplateTab";
import ThemeTab from "./tabs/ThemeTab";

export type SaveDraft = (body: { patch?: SiteOverrides; templateSlug?: StorefrontTemplateSlug }, message?: string) => Promise<boolean>;

export type TabProps = {
  slug: string;
  state: EditorState;
  saving: boolean;
  saveDraft: SaveDraft;
  /** Reloads the editor's state and the preview after a change made outside the draft (pages). */
  refresh: () => Promise<void>;
};

// Each tab has its own colour and a line saying what it's for, so it's easy to find your way back.
const TABS = [
  { key: "template", label: "Template", icon: LayoutTemplate, meaning: "marketing", help: "Pick the look of your whole shop. Your words and pictures come with you." },
  { key: "theme", label: "Theme and brand", icon: Palette, meaning: "customers", help: "Your logo, colours and fonts." },
  { key: "homepage", label: "Homepage", icon: Home, meaning: "orders", help: "Choose and order the sections on your front page." },
  { key: "content", label: "Words", icon: Type, meaning: "stock", help: "The headings, buttons and messages shoppers read." },
  { key: "pages", label: "Pages", icon: FileText, meaning: "marketing", help: "About, Contact, FAQs and any other pages for your brand." },
  { key: "navigation", label: "Menus", icon: Menu, meaning: "orders", help: "What shows in your shop's top menu and footer." },
  { key: "media", label: "Images", icon: ImageIcon, meaning: "money", help: "Every picture you've uploaded, in one place." },
  { key: "seo", label: "Search and sharing", icon: Search, meaning: "customers", help: "How your shop looks on Google and when its link is shared, your advert tracking, and your product feed for Google, Facebook and Instagram." },
] as const;

type TabKey = (typeof TABS)[number]["key"];

/**
 * The website editor: settings on the left, the shop's draft in a live preview
 * on the right. Changes save to the draft; customers see them only when the
 * owner publishes.
 */
export default function WebsiteEditor({ slug }: { slug: string }) {
  const [state, setState] = useState<EditorState | null>(null);
  const [tab, setTab] = useState<TabKey>("template");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [previewKey, setPreviewKey] = useState(0);
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const [showHistory, setShowHistory] = useState(false);

  const refresh = useCallback(async () => {
    const res = await fetch(`/api/store/site?slug=${encodeURIComponent(slug)}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(typeof data.error === "string" ? data.error : "We couldn't load your website settings.");
      return;
    }
    setState(data);
    setPreviewKey((k) => k + 1);
  }, [slug]);

  useEffect(() => {
    fetch(`/api/store/site?slug=${encodeURIComponent(slug)}`)
      .then(async (res) => ({ ok: res.ok, data: await res.json().catch(() => ({})) }))
      .then(({ ok, data }) => (ok ? setState(data) : setError(typeof data.error === "string" ? data.error : "We couldn't load your website settings.")))
      .catch(() => setError("We couldn't load your website settings."));
  }, [slug]);

  const apply = (data: EditorState, note: string) => {
    setState(data);
    setPreviewKey((k) => k + 1);
    setMessage(note);
  };

  const saveDraft: SaveDraft = async (body, note = "Saved. Your changes are in the preview.") => {
    setSaving(true);
    setError("");
    setMessage("");
    try {
      apply(await sendJson("/api/store/site/draft", "POST", { slug, ...body }), note);
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setSaving(false);
    }
  };

  const history = async (body: { action: "discard" } | { action: "restore"; version: number }, note: string, confirmText: string) => {
    if (!window.confirm(confirmText)) return;
    setSaving(true);
    setError("");
    try {
      apply(await sendJson("/api/store/site/history", "POST", { slug, ...body }), note);
      setShowHistory(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const publish = async () => {
    setSaving(true);
    setError("");
    try {
      await sendJson("/api/store/site/publish", "POST", { slug, action: "publish" });
      await refresh();
      setMessage("Published. Customers can now see your changes.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  if (!state) return <p className="text-sm text-slate-500">{error || "Loading your website…"}</p>;

  const live = state.status === "live";
  const tabProps: TabProps = { slug, state, saving, saveDraft, refresh };
  const current = TABS.find((t) => t.key === tab) ?? TABS[0];
  const currentTone = MEANING[current.meaning as Meaning];

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <div
        className={`flex flex-wrap items-center justify-between gap-3 rounded-2xl border px-4 py-3 ${live ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"}`}
      >
        <div className="flex items-center gap-3" role="status">
          <span aria-hidden className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white shadow-sm ${live ? "text-emerald-600" : "text-amber-600"}`}>
            {live ? <CircleCheck className="h-5 w-5" /> : <Rocket className="h-5 w-5" />}
          </span>
          <div className="text-sm">
            <p className="font-heading font-semibold text-slate-900">
              {live ? "Your shop is live" : state.status === "paused" ? "Your shop is offline" : "Your shop isn't published yet"}
            </p>
            <p className="text-slate-700">
              {state.hasUnpublishedChanges
                ? "You have changes customers can't see yet. Publish when you're happy."
                : live
                  ? "Customers see exactly what's in the preview."
                  : "Shape it here, then publish to open it to customers."}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <button type="button" onClick={() => setShowHistory((s) => !s)} aria-expanded={showHistory} className="inline-flex items-center gap-1.5 rounded-xl border border-white bg-white/80 px-3 py-2 text-sm font-medium text-slate-800 shadow-sm hover:bg-white">
              <History className="h-4 w-4" aria-hidden /> History
            </button>
            {showHistory ? (
              <div className="absolute right-0 z-10 mt-1 w-72 rounded-xl border border-slate-200 bg-white p-2 shadow-lg">
                {state.hasUnpublishedChanges ? (
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => history({ action: "discard" }, "Unpublished changes discarded.", "Throw away all unpublished changes? This can't be undone.")}
                    className="block w-full rounded-lg px-3 py-2 text-left text-sm text-red-700 hover:bg-red-50"
                  >
                    Discard unpublished changes
                  </button>
                ) : null}
                <p className="px-3 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Published versions</p>
                {state.versions.length === 0 ? <p className="px-3 py-2 text-sm text-slate-500">Nothing published yet.</p> : null}
                <ul>
                  {state.versions.map((v) => (
                    <li key={v.version}>
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() =>
                          history(
                            { action: "restore", version: v.version },
                            `Version ${v.version} restored to your draft. Publish to make it live.`,
                            `Copy version ${v.version} into your draft? Your unpublished changes will be replaced. Nothing goes live until you publish.`,
                          )
                        }
                        className="block w-full rounded-lg px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                      >
                        Version {v.version} · {new Date(v.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
          <a href={`/shop/${slug}?sfpreview=1`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-xl border border-white bg-white/80 px-3 py-2 text-sm font-medium text-slate-800 shadow-sm hover:bg-white">
            Open preview <ExternalLink className="h-3.5 w-3.5" aria-hidden />
            <span className="sr-only">(opens in a new tab)</span>
          </a>
          <button
            type="button"
            onClick={publish}
            disabled={saving || (live && !state.hasUnpublishedChanges)}
            className="inline-flex items-center gap-1.5 rounded-xl bg-xyvoo-blue px-4 py-2 text-sm font-semibold text-white shadow-sm hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Rocket className="h-4 w-4" aria-hidden />
            {live ? "Publish changes" : "Publish shop"}
          </button>
        </div>
      </div>

      {error ? <DashAlert message={error} /> : null}
      {message ? (
        <p role="status" className="text-sm text-emerald-700">
          {message}
        </p>
      ) : null}

      <div className="grid min-h-0 flex-1 gap-4 xl:grid-cols-[minmax(22rem,28rem)_1fr]">
        <div className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div role="tablist" aria-label="Website settings" className="flex flex-wrap gap-1.5 border-b border-slate-200 bg-slate-50/70 p-2.5">
            {TABS.map((t) => (
              <button
                key={t.key}
                role="tab"
                id={`tab-${t.key}`}
                aria-selected={tab === t.key}
                aria-controls={`panel-${t.key}`}
                tabIndex={tab === t.key ? 0 : -1}
                onClick={() => {
                  setTab(t.key);
                  setMessage("");
                }}
                onKeyDown={(e) => {
                  if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
                  const i = TABS.findIndex((x) => x.key === tab);
                  const next = TABS[(i + (e.key === "ArrowRight" ? 1 : TABS.length - 1)) % TABS.length];
                  setTab(next.key);
                  document.getElementById(`tab-${next.key}`)?.focus();
                }}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-xyvoo-blue ${
                  tab === t.key ? MEANING[t.meaning as Meaning].chipOn : "border-transparent text-slate-700 hover:bg-white"
                }`}
              >
                <t.icon className={`h-4 w-4 ${MEANING[t.meaning as Meaning].icon}`} aria-hidden />
                {t.label}
              </button>
            ))}
          </div>
          <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} className="min-h-0 flex-1 overflow-y-auto p-5">
            <div className={`mb-5 flex items-start gap-3 rounded-xl p-3.5 ${currentTone.tint}`}>
              <span aria-hidden className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl shadow-sm ${currentTone.iconBox}`}>
                <current.icon className="h-[18px] w-[18px]" />
              </span>
              <div className="min-w-0 text-sm">
                <p className="font-heading font-semibold text-slate-900">{current.label}</p>
                <p className="text-slate-700">{current.help}</p>
              </div>
            </div>
            {tab === "template" ? <TemplateTab {...tabProps} /> : null}
            {tab === "theme" ? <ThemeTab key={previewKey} {...tabProps} /> : null}
            {tab === "homepage" ? <HomepageTab key={previewKey} {...tabProps} /> : null}
            {tab === "content" ? <ContentTab key={previewKey} {...tabProps} /> : null}
            {tab === "pages" ? <PagesTab {...tabProps} /> : null}
            {tab === "navigation" ? <NavigationTab key={previewKey} {...tabProps} /> : null}
            {tab === "media" ? <MediaTab {...tabProps} /> : null}
            {tab === "seo" ? <SeoTab key={previewKey} {...tabProps} /> : null}
          </div>
        </div>

        <section aria-label="Preview of your shop" className="flex min-h-[32rem] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-2.5">
            <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-slate-800">
              <span aria-hidden className="flex h-7 w-7 items-center justify-center rounded-lg bg-rose-50 text-rose-600">
                <Eye className="h-4 w-4" />
              </span>
              Preview
              <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-900">Only you can see unpublished changes</span>
            </p>
            <div className="flex gap-1 rounded-xl bg-slate-100 p-1" role="group" aria-label="Preview size">
              <button type="button" onClick={() => setDevice("desktop")} aria-pressed={device === "desktop"} className={`rounded-lg p-1.5 ${device === "desktop" ? "bg-white text-sky-700 shadow-sm" : "text-slate-600"}`}>
                <Monitor className="h-4 w-4" aria-hidden />
                <span className="sr-only">Desktop</span>
              </button>
              <button type="button" onClick={() => setDevice("mobile")} aria-pressed={device === "mobile"} className={`rounded-lg p-1.5 ${device === "mobile" ? "bg-white text-sky-700 shadow-sm" : "text-slate-600"}`}>
                <Smartphone className="h-4 w-4" aria-hidden />
                <span className="sr-only">Phone</span>
              </button>
            </div>
          </div>
          <div className="flex flex-1 justify-center overflow-hidden bg-gradient-to-br from-sky-50 via-rose-50 to-amber-50 p-4">
            <div className={`flex h-full flex-col overflow-hidden border border-slate-200 bg-white shadow-lg ${device === "mobile" ? "w-[390px] rounded-[1.75rem]" : "w-full rounded-xl"}`}>
              {/* A little browser bar, so it reads as "your shop in a browser". */}
              <div aria-hidden className="flex shrink-0 items-center gap-1.5 border-b border-slate-100 bg-slate-50 px-3 py-2">
                <span className="h-2.5 w-2.5 rounded-full bg-rose-400" />
                <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
                <span className="ml-2 truncate rounded-md bg-white px-2 py-0.5 text-[11px] text-slate-500">/shop/{slug}</span>
              </div>
              <iframe key={previewKey} src={`/shop/${slug}?sfpreview=1`} title="Preview of your shop" className="min-h-0 w-full flex-1 bg-white" />
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

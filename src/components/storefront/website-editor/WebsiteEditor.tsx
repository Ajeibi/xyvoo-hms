"use client";

import { useCallback, useEffect, useState } from "react";
import { ExternalLink, History, Monitor, Smartphone } from "lucide-react";
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

const TABS = [
  { key: "template", label: "Template" },
  { key: "theme", label: "Theme and brand" },
  { key: "homepage", label: "Homepage" },
  { key: "content", label: "Words" },
  { key: "pages", label: "Pages" },
  { key: "navigation", label: "Menus" },
  { key: "media", label: "Images" },
  { key: "seo", label: "Search and sharing" },
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

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3">
        <p className="text-sm text-slate-700" role="status">
          <span className={`mr-2 inline-block h-2 w-2 rounded-full ${live ? "bg-emerald-500" : "bg-amber-500"}`} aria-hidden />
          {live ? "Live" : state.status === "paused" ? "Offline" : "Not published yet"}
          {state.hasUnpublishedChanges ? " · You have unpublished changes" : live ? " · Up to date" : ""}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <button type="button" onClick={() => setShowHistory((s) => !s)} aria-expanded={showHistory} className="inline-flex items-center gap-1 rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-slate-100">
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
          <a href={`/shop/${slug}?sfpreview=1`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-slate-100">
            Open preview <ExternalLink className="h-3.5 w-3.5" aria-hidden />
            <span className="sr-only">(opens in a new tab)</span>
          </a>
          <button
            type="button"
            onClick={publish}
            disabled={saving || (live && !state.hasUnpublishedChanges)}
            className="rounded-lg bg-xyvoo-blue px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
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
        <div className="flex min-h-0 flex-col rounded-2xl border border-slate-200 bg-white">
          <div role="tablist" aria-label="Website settings" className="flex flex-wrap gap-1 border-b border-slate-200 p-2">
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
                className={`rounded-lg px-3 py-1.5 text-sm ${tab === t.key ? "bg-blue-50 font-semibold text-blue-700" : "text-slate-600 hover:bg-slate-50"}`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} className="min-h-0 flex-1 overflow-y-auto p-5">
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

        <section aria-label="Preview of your shop" className="flex min-h-[32rem] flex-col rounded-2xl border border-slate-200 bg-white">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2">
            <p className="text-sm font-medium text-slate-700">Preview (only you can see unpublished changes)</p>
            <div className="flex gap-1" role="group" aria-label="Preview size">
              <button type="button" onClick={() => setDevice("desktop")} aria-pressed={device === "desktop"} className={`rounded-lg p-1.5 ${device === "desktop" ? "bg-slate-100 text-slate-900" : "text-slate-500"}`}>
                <Monitor className="h-4 w-4" aria-hidden />
                <span className="sr-only">Desktop</span>
              </button>
              <button type="button" onClick={() => setDevice("mobile")} aria-pressed={device === "mobile"} className={`rounded-lg p-1.5 ${device === "mobile" ? "bg-slate-100 text-slate-900" : "text-slate-500"}`}>
                <Smartphone className="h-4 w-4" aria-hidden />
                <span className="sr-only">Phone</span>
              </button>
            </div>
          </div>
          <div className="flex flex-1 justify-center overflow-hidden bg-slate-100 p-3">
            <iframe
              key={previewKey}
              src={`/shop/${slug}?sfpreview=1`}
              title="Preview of your shop"
              className={`h-full rounded-lg border border-slate-200 bg-white ${device === "mobile" ? "w-[390px]" : "w-full"}`}
            />
          </div>
        </section>
      </div>
    </div>
  );
}

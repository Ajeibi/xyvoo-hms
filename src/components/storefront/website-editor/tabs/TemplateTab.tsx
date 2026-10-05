"use client";

import { useState } from "react";
import { ExternalLink } from "lucide-react";
import { TemplateThumbnail } from "@/components/website/TemplateThumbnail";
import { WEBSITE_TEMPLATES } from "@/constants/website-templates";
import type { StorefrontTemplateSlug } from "@/lib/store/site/templates";
import type { TabProps } from "../WebsiteEditor";

const TEMPLATES = WEBSITE_TEMPLATES.filter((t) => t.kind === "storefront");

/** Switch template. Words, images, menus and colours carry across; the homepage keeps its sections. */
export default function TemplateTab({ state, saving, saveDraft }: TabProps) {
  const [choice, setChoice] = useState<StorefrontTemplateSlug>(state.templateSlug);

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        void saveDraft({ templateSlug: choice }, "Template changed. Check the preview, then publish when you're happy.");
      }}
    >
      <p className="text-sm text-slate-600">Your words, images, menus and colour choices carry over when you switch.</p>
      <fieldset className="space-y-3">
        <legend className="sr-only">Choose a template</legend>
        {TEMPLATES.map((t) => (
          <div key={t.slug} className={`overflow-hidden rounded-xl border-2 ${choice === t.slug ? "border-xyvoo-blue" : "border-slate-200"}`}>
            <label className="block cursor-pointer">
              <TemplateThumbnail src={`${t.previewPath}/index.html`} title={t.name} />
              <span className="flex items-start gap-3 p-3">
                <input type="radio" name="template" checked={choice === t.slug} onChange={() => setChoice(t.slug as StorefrontTemplateSlug)} className="mt-1" />
                <span>
                  <span className="block font-semibold text-slate-900">
                    {t.name} {state.templateSlug === t.slug ? <span className="ml-1 text-xs font-normal text-slate-500">(current)</span> : null}
                  </span>
                  <span className="block text-sm text-slate-600">{t.summary}</span>
                </span>
              </span>
            </label>
            <a href={`${t.previewPath}/index.html`} target="_blank" rel="noreferrer" className="mx-3 mb-3 inline-flex items-center gap-1 text-sm text-slate-700 hover:underline">
              See the full template <ExternalLink className="h-3.5 w-3.5" aria-hidden />
              <span className="sr-only">(opens in a new tab)</span>
            </a>
          </div>
        ))}
      </fieldset>
      <button type="submit" disabled={saving || choice === state.templateSlug} className="rounded-xl bg-xyvoo-blue px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
        {saving ? "Saving…" : "Use this template"}
      </button>
    </form>
  );
}

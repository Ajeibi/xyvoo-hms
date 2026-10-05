"use client";

import { useState } from "react";
import { ExternalLink } from "lucide-react";
import { TemplateThumbnail } from "@/components/website/TemplateThumbnail";
import { WEBSITE_TEMPLATES } from "@/constants/website-templates";
import { templateSchema } from "@/lib/store/site/onboarding-steps";
import type { StepProps, WizardInitial } from "../OnboardingWizard";
import { StepActions } from "../fields";

const STOREFRONT_TEMPLATES = WEBSITE_TEMPLATES.filter((t) => t.kind === "storefront");

export default function TemplateStep({ initial, busy, backHref, onSubmit }: StepProps<WizardInitial["template"]>) {
  const [templateSlug, setTemplateSlug] = useState(initial.templateSlug);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    onSubmit(templateSchema.parse({ templateSlug }));
  };

  return (
    <form onSubmit={submit} className="space-y-6">
      <fieldset>
        <legend className="sr-only">Choose a template</legend>
        <div className="grid gap-4 md:grid-cols-3">
          {STOREFRONT_TEMPLATES.map((t) => {
            const selected = templateSlug === t.slug;
            return (
              <div key={t.slug} className={`overflow-hidden rounded-2xl border-2 ${selected ? "border-xyvoo-teal-product-hover" : "border-slate-200"}`}>
                <label className="block cursor-pointer">
                  <TemplateThumbnail src={`${t.previewPath}/index.html`} title={t.name} />
                  <span className="flex items-start gap-3 p-4">
                    <input
                      type="radio"
                      name="template"
                      value={t.slug}
                      checked={selected}
                      onChange={() => setTemplateSlug(t.slug as typeof templateSlug)}
                      className="mt-1 accent-xyvoo-teal-product-hover"
                    />
                    <span>
                      <span className="block text-base font-semibold text-slate-900">{t.name}</span>
                      <span className="block text-sm text-slate-600">{t.summary}</span>
                    </span>
                  </span>
                </label>
                <a
                  href={`${t.previewPath}/index.html`}
                  target="_blank"
                  rel="noreferrer"
                  className="mx-4 mb-4 inline-flex items-center gap-1 text-sm font-medium text-slate-700 underline-offset-2 hover:underline"
                >
                  See the full template <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                  <span className="sr-only">(opens in a new tab)</span>
                </a>
              </div>
            );
          })}
        </div>
      </fieldset>
      <p className="text-sm text-slate-600">The previews use sample products and words. Your shop will show yours.</p>
      <StepActions busy={busy} backHref={backHref} />
    </form>
  );
}

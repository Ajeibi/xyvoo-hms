"use client";

import { ExternalLink } from "lucide-react";
import type { StepProps } from "../OnboardingWizard";
import { StepActions } from "../fields";

/**
 * The store as customers will see it, in a frame. Store members see the
 * draft at /shop/<slug>; the public sees "opening soon" until it's published.
 */
export default function PreviewStep({ slug, busy, backHref, onSubmit }: StepProps<null>) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({});
      }}
      className="space-y-6"
    >
      <div className="overflow-hidden rounded-2xl border border-slate-200">
        <iframe src={`/shop/${slug}`} title="Preview of your shop" className="h-[70vh] w-full bg-white" />
      </div>
      <ul className="space-y-2 text-sm text-slate-700">
        <li>Your shop shows sample text until you change it, and no products until you add some.</li>
        <li>Next, on your dashboard: add products, connect payments, then publish when you&rsquo;re ready.</li>
      </ul>
      <a href={`/shop/${slug}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm font-medium text-slate-700 underline-offset-2 hover:underline">
        Open the preview in a new tab <ExternalLink className="h-3.5 w-3.5" aria-hidden />
        <span className="sr-only">(opens in a new tab)</span>
      </a>
      <StepActions busy={busy} backHref={backHref} submitLabel="Finish and go to my dashboard" />
    </form>
  );
}

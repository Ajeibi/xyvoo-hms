"use client";

import { useMemo, useRef, useState } from "react";
import { ImagePlus, Trash2 } from "lucide-react";
import { FONT_PAIRINGS, type FontPairingId } from "@/lib/store/site/fonts";
import { brandSchema } from "@/lib/store/site/onboarding-steps";
import { resolveSite } from "@/lib/store/site/resolve";
import { getStorefrontTemplate, type StorefrontTemplateSlug } from "@/lib/store/site/templates";
import type { StepProps, WizardInitial } from "../OnboardingWizard";
import { describedBy, ErrorBanner, Field, inputClass, StepActions } from "../fields";

const ACCEPTED = "image/png,image/jpeg,image/webp,image/svg+xml";

export default function BrandStep({
  slug,
  initial,
  busy,
  errorMessage,
  errorField,
  backHref,
  onSubmit,
  templateSlug,
  storeName,
}: StepProps<WizardInitial["brand"]> & { templateSlug: StorefrontTemplateSlug; storeName: string }) {
  const template = getStorefrontTemplate(templateSlug);
  const [logoUrl, setLogoUrl] = useState(initial.logoUrl);
  const [useCustom, setUseCustom] = useState(Boolean(initial.accent));
  const [accent, setAccent] = useState(initial.accent ?? template.theme.colours.accent);
  const [fontPairing, setFontPairing] = useState<FontPairingId>(initial.fontPairing);
  const [tagline, setTagline] = useState(initial.tagline);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);

  // Same check the server makes: can button text be read on this colour?
  const buttonProblem = useMemo(() => {
    if (!useCustom) return null;
    const site = resolveSite(template.slug, { theme: { colours: { accent } } }, { storeName });
    return site.contrastIssues.find((i) => i.label.startsWith("Button text")) ?? null;
  }, [useCustom, accent, template.slug, storeName]);

  const fonts = [
    ...template.recommendedFonts.map((id) => FONT_PAIRINGS.find((p) => p.id === id)!),
    ...FONT_PAIRINGS.filter((p) => !template.recommendedFonts.includes(p.id)),
  ];

  const upload = async (file: File) => {
    setUploadError("");
    if (file.size > 5 * 1024 * 1024) return setUploadError("Please choose an image of 5MB or less.");
    setUploading(true);
    try {
      const form = new FormData();
      form.append("slug", slug);
      form.append("file", file);
      const res = await fetch("/api/store/products/upload-image", { method: "POST", body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.url) return setUploadError(typeof data.error === "string" ? data.error : "We couldn't upload that image. Please try another.");
      setLogoUrl(data.url);
    } catch {
      setUploadError("We couldn't connect. Check your internet connection and try again.");
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (buttonProblem) return document.getElementById("brand-accent")?.focus();
    onSubmit(brandSchema.parse({ logoUrl, accent: useCustom ? accent.toUpperCase() : null, fontPairing, tagline }));
  };

  return (
    <form onSubmit={submit} className="space-y-8" noValidate>
      {errorField ? <ErrorBanner message={errorMessage} /> : null}

      <section aria-labelledby="brand-logo-title" className="space-y-3">
        <h2 id="brand-logo-title" className="text-sm font-medium text-slate-800">
          Logo <span className="font-normal text-slate-500">(optional)</span>
        </h2>
        <p className="text-sm text-slate-600">PNG, JPG, WebP or SVG, up to 5MB. Without a logo, your store name is shown in the template&rsquo;s lettering.</p>
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex h-20 w-40 items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 p-2">
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- merchant upload preview
              <img src={logoUrl} alt={`${storeName} logo`} className="max-h-full max-w-full object-contain" />
            ) : (
              <span className="text-sm text-slate-500">No logo yet</span>
            )}
          </div>
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-800 focus-within:ring-2 focus-within:ring-xyvoo-teal-product-hover hover:bg-slate-50">
            <ImagePlus className="h-4 w-4" aria-hidden />
            {uploading ? "Uploading…" : logoUrl ? "Replace logo" : "Upload a logo"}
            <input
              ref={fileInput}
              type="file"
              accept={ACCEPTED}
              className="sr-only"
              disabled={uploading}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void upload(file);
              }}
            />
          </label>
          {logoUrl ? (
            <button type="button" onClick={() => setLogoUrl(null)} className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-red-700">
              <Trash2 className="h-4 w-4" aria-hidden />
              Remove logo
            </button>
          ) : null}
        </div>
        <p role="status" className="text-sm text-red-700">
          {uploadError}
        </p>
      </section>

      <fieldset className="space-y-3">
        <legend className="text-sm font-medium text-slate-800">Colours</legend>
        <label className={`flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 text-sm ${!useCustom ? "border-xyvoo-teal-product-hover" : "border-slate-300"}`}>
          <input type="radio" name="palette" checked={!useCustom} onChange={() => setUseCustom(false)} className="accent-xyvoo-teal-product-hover" />
          <span className="flex gap-1" aria-hidden>
            {[template.theme.colours.accent, template.theme.colours.dark, template.theme.colours.surface].map((c) => (
              <span key={c} className="h-6 w-6 rounded-full border border-slate-200" style={{ background: c }} />
            ))}
          </span>
          Keep {template.name}&rsquo;s colours
        </label>
        <label className={`flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 text-sm ${useCustom ? "border-xyvoo-teal-product-hover" : "border-slate-300"}`}>
          <input type="radio" name="palette" checked={useCustom} onChange={() => setUseCustom(true)} className="accent-xyvoo-teal-product-hover" />
          Use my brand colour for buttons and highlights
        </label>
        {useCustom ? (
          <Field
            id="brand-accent"
            label="Brand colour"
            hint="Pick your main brand colour. We'll check that button text stays easy to read."
            error={buttonProblem ? "Button text wouldn't be easy to read on this colour. Try a darker or lighter shade." : undefined}
          >
            <div className="flex items-center gap-3">
              <input
                id="brand-accent"
                type="color"
                value={accent}
                onChange={(e) => setAccent(e.target.value)}
                className="h-12 w-20 cursor-pointer rounded-lg border border-slate-300 bg-white p-1"
                aria-invalid={Boolean(buttonProblem) || undefined}
                aria-describedby={describedBy("brand-accent", { hint: true, error: buttonProblem ? "x" : undefined })}
              />
              <span className="font-mono text-sm text-slate-700">{accent.toUpperCase()}</span>
              <span className="rounded-lg px-4 py-2 text-sm font-semibold" style={{ background: accent, color: resolveSite(template.slug, { theme: { colours: { accent } } }, { storeName }).theme.onAccent }}>
                Sample button
              </span>
            </div>
          </Field>
        ) : null}
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-slate-800">Fonts</legend>
        <p className="text-sm text-slate-600">The first {template.recommendedFonts.length} suit {template.name} best. You&rsquo;ll see them on your shop in the preview step.</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {fonts.map((pairing) => (
            <label
              key={pairing.id}
              className={`flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 text-sm ${fontPairing === pairing.id ? "border-xyvoo-teal-product-hover" : "border-slate-300"}`}
            >
              <input type="radio" name="fonts" checked={fontPairing === pairing.id} onChange={() => setFontPairing(pairing.id)} className="accent-xyvoo-teal-product-hover" />
              <span>
                {pairing.label}
                {pairing.id === template.theme.fontPairing ? <span className="ml-2 text-xs text-slate-500">(template default)</span> : null}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <Field id="brand-tagline" label="Tagline" optional hint="A short line about your store, used in your footer and search results.">
        <input
          id="brand-tagline"
          className={inputClass}
          maxLength={140}
          value={tagline}
          onChange={(e) => setTagline(e.target.value)}
          aria-describedby="brand-tagline-hint"
          placeholder="e.g. Handmade leather goods from Lagos"
        />
      </Field>

      <StepActions busy={busy || uploading} backHref={backHref} />
    </form>
  );
}

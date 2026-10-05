"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { FONT_PAIRINGS, type FontPairingId } from "@/lib/store/site/fonts";
import { resolveSite } from "@/lib/store/site/resolve";
import { BUTTON_SHAPES, CARD_VARIANTS, CORNER_STYLES, THEME_COLOUR_KEYS, type SiteTheme, type ThemeColourKey } from "@/lib/store/site/schema";
import { getStorefrontTemplate } from "@/lib/store/site/templates";
import { DashField, dashInput } from "../../dashboard-ui";
import ImagePicker from "../ImagePicker";
import type { TabProps } from "../WebsiteEditor";

const COLOUR_LABELS: Record<ThemeColourKey, string> = {
  bg: "Page background",
  surface: "Panels and cards",
  ink: "Main text",
  muted: "Secondary text",
  accent: "Buttons and highlights",
  accentHover: "Buttons when pointed at",
  dark: "Dark bands and footer",
  onDark: "Text on dark bands",
};
const BUTTON_LABELS = { square: "Square", rounded: "Slightly rounded", pill: "Pill" } as const;
const CORNER_LABELS = { square: "Square", soft: "Soft", round: "Round" } as const;
const CARD_LABELS = { basket: "With “Add to basket”", view: "Arched, with “View”", icons: "Compact, with icons" } as const;

export default function ThemeTab({ slug, state, saving, saveDraft }: TabProps) {
  const template = getStorefrontTemplate(state.templateSlug);
  const [colours, setColours] = useState<Record<ThemeColourKey, string>>(state.resolved.theme.colours);
  const [fontPairing, setFontPairing] = useState<FontPairingId>(state.resolved.theme.fontPairing as FontPairingId);
  const [buttonShape, setButtonShape] = useState<SiteTheme["buttonShape"]>(state.resolved.theme.buttonShape);
  const [cornerStyle, setCornerStyle] = useState<SiteTheme["cornerStyle"]>(state.resolved.theme.cornerStyle);
  const [cardVariant, setCardVariant] = useState<SiteTheme["cardVariant"]>(state.resolved.theme.cardVariant);
  const [brand, setBrand] = useState(state.resolved.brand);

  // Only colours that differ from the template are stored, so switching template later keeps its own palette for the rest.
  const changedColours = useMemo(
    () => Object.fromEntries(THEME_COLOUR_KEYS.filter((k) => colours[k].toUpperCase() !== template.theme.colours[k].toUpperCase()).map((k) => [k, colours[k].toUpperCase()])),
    [colours, template],
  );
  const issues = useMemo(
    () => resolveSite(template.slug, { theme: { colours: changedColours } }, { storeName: "" }).contrastIssues,
    [template.slug, changedColours],
  );

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    if (brand.logoUrl && !brand.logoAlt.trim()) return;
    void saveDraft({ patch: { theme: { colours: changedColours, fontPairing, buttonShape, cornerStyle, cardVariant }, brand } });
  };

  const radios = <T extends string>(name: string, legend: string, options: readonly T[], labels: Record<T, string>, value: T, set: (v: T) => void) => (
    <fieldset>
      <legend className="mb-2 text-sm font-medium text-slate-800">{legend}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <label key={o} className={`cursor-pointer rounded-lg border px-3 py-1.5 text-sm ${value === o ? "border-xyvoo-blue bg-blue-50" : "border-slate-300"}`}>
            <input type="radio" name={name} checked={value === o} onChange={() => set(o)} className="sr-only" />
            {labels[o]}
          </label>
        ))}
      </div>
    </fieldset>
  );

  return (
    <form onSubmit={save} className="space-y-7" noValidate>
      <section aria-labelledby="brand-title" className="space-y-4">
        <h2 id="brand-title" className="text-base font-semibold text-slate-900">
          Brand
        </h2>
        <ImagePicker
          id="theme-logo"
          label="Logo"
          slug={slug}
          url={brand.logoUrl}
          onChange={(logoUrl) => setBrand({ ...brand, logoUrl })}
          alt={brand.logoAlt}
          onAltChange={(logoAlt) => setBrand({ ...brand, logoAlt })}
        />
        {brand.logoUrl && !brand.logoAlt.trim() ? <p className="text-sm text-red-700">Describe your logo, for example your store name.</p> : null}
        <ImagePicker id="theme-favicon" label="Browser tab icon (optional; your logo is used if empty)" slug={slug} url={brand.faviconUrl} onChange={(faviconUrl) => setBrand({ ...brand, faviconUrl })} decorative />
        <DashField id="theme-tagline" label="Tagline" optional hint="A short line about your store, used in your footer and search results.">
          <input id="theme-tagline" className={dashInput} maxLength={140} value={brand.tagline} onChange={(e) => setBrand({ ...brand, tagline: e.target.value })} aria-describedby="theme-tagline-hint" />
        </DashField>
      </section>

      <section aria-labelledby="colours-title" className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 id="colours-title" className="text-base font-semibold text-slate-900">
            Colours
          </h2>
          <button type="button" onClick={() => setColours(template.theme.colours)} className="inline-flex items-center gap-1 text-sm text-slate-600 hover:underline">
            <RotateCcw className="h-3.5 w-3.5" aria-hidden /> Use {template.name}&rsquo;s colours
          </button>
        </div>
        <ul className="space-y-2">
          {THEME_COLOUR_KEYS.map((key) => (
            <li key={key} className="flex items-center gap-3">
              <input
                id={`colour-${key}`}
                type="color"
                value={colours[key]}
                onChange={(e) => setColours({ ...colours, [key]: e.target.value })}
                className="h-9 w-12 cursor-pointer rounded border border-slate-300 bg-white p-0.5"
              />
              <label htmlFor={`colour-${key}`} className="flex-1 text-sm text-slate-800">
                {COLOUR_LABELS[key]}
              </label>
              <span className="font-mono text-xs text-slate-500">{colours[key].toUpperCase()}</span>
            </li>
          ))}
        </ul>
        {issues.length ? (
          <div role="status" className="space-y-1 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            <p className="flex items-center gap-2 font-medium">
              <AlertTriangle className="h-4 w-4" aria-hidden /> Some text would be hard to read
            </p>
            <ul className="list-disc pl-5">
              {issues.map((i) => (
                <li key={i.label}>
                  {i.label} (contrast {i.ratio}:1, needs 4.5:1)
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>

      <fieldset className="space-y-2">
        <legend className="text-base font-semibold text-slate-900">Fonts</legend>
        {FONT_PAIRINGS.map((p) => (
          <label key={p.id} className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 text-sm ${fontPairing === p.id ? "border-xyvoo-blue bg-blue-50" : "border-slate-300"}`}>
            <input type="radio" name="fonts" checked={fontPairing === p.id} onChange={() => setFontPairing(p.id)} />
            {p.label}
            {template.recommendedFonts.includes(p.id) ? <span className="text-xs text-slate-500">Suits {template.name}</span> : null}
          </label>
        ))}
      </fieldset>

      <section aria-labelledby="style-title" className="space-y-4">
        <h2 id="style-title" className="text-base font-semibold text-slate-900">
          Style
        </h2>
        {radios("buttons", "Buttons", BUTTON_SHAPES, BUTTON_LABELS, buttonShape, setButtonShape)}
        {radios("corners", "Corners on cards and images", CORNER_STYLES, CORNER_LABELS, cornerStyle, setCornerStyle)}
        {radios("cards", "Product cards", CARD_VARIANTS, CARD_LABELS, cardVariant, setCardVariant)}
      </section>

      <button type="submit" disabled={saving || Boolean(issues.find((i) => i.label.startsWith("Button text")))} className="rounded-xl bg-xyvoo-blue px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
        {saving ? "Saving…" : "Save theme and brand"}
      </button>
    </form>
  );
}

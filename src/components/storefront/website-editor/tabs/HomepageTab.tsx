"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, Plus, Trash2 } from "lucide-react";
import { PRODUCT_LIST_SOURCES, sectionSchema, type SiteSection, type SiteSectionType } from "@/lib/store/site/schema";
import { DashAlert, DashField, dashInput } from "../../dashboard-ui";
import ImagePicker from "../ImagePicker";
import type { TabProps } from "../WebsiteEditor";

const SECTION_LABELS: Record<SiteSectionType, string> = {
  hero: "Main banner",
  "value-strip": "Reasons to buy",
  "category-tiles": "Shop by category",
  "featured-collections": "Featured collections",
  "product-list": "Product row",
  promo: "Promotion",
  reviews: "Customer reviews",
  journal: "Journal (coming soon)",
  press: "As featured in",
  gallery: "Photo gallery",
  newsletter: "Newsletter sign-up (coming soon)",
};

const ADDABLE: SiteSectionType[] = ["hero", "value-strip", "category-tiles", "featured-collections", "product-list", "promo", "reviews", "press", "gallery"];

const SOURCE_LABELS: Record<(typeof PRODUCT_LIST_SOURCES)[number], string> = {
  featured: "Featured products",
  "new-arrival": "New arrivals",
  "best-seller": "Bestsellers",
  "on-sale": "On sale",
  collection: "A collection",
};

function newSection(type: SiteSectionType): SiteSection {
  const id = `${type}-${Math.random().toString(36).slice(2, 8)}`;
  const base = { id, enabled: true };
  switch (type) {
    case "hero":
      return { ...base, type, eyebrow: "", heading: "Welcome to our store", text: "", primaryCta: { label: "Shop now", href: "/products" }, secondaryCta: null, image: null };
    case "value-strip":
      return { ...base, type, items: [{ icon: "truck", title: "Fast delivery", text: "" }] };
    case "category-tiles":
      return { ...base, type, heading: "Shop by category", collectionIds: [] };
    case "featured-collections":
      return { ...base, type, heading: "", collectionIds: [] };
    case "product-list":
      return { ...base, type, heading: "New arrivals", source: "new-arrival", collectionId: null, limit: 8 };
    case "promo":
      return { ...base, type, eyebrow: "", heading: "Our latest offer", text: "", cta: { label: "Shop now", href: "/products" }, image: null, endsAt: null };
    case "reviews":
      return { ...base, type, heading: "What our customers say" };
    case "journal":
      return { ...base, type, heading: "From the journal" };
    case "press":
      return { ...base, type, heading: "As featured in", names: [] };
    case "gallery":
      return { ...base, type, heading: "", images: [] };
    case "newsletter":
      return { ...base, type, heading: "Join our mailing list", text: "", note: "" };
  }
}

const ICONS = ["truck", "shield", "returns", "leaf", "star", "heart", "clock", "headset", "card", "package", "sparkle", "check"];

/** Link field for buttons: a store page path ("/products") or a full https address. */
function LinkFields({ id, value, onChange }: { id: string; value: { label: string; href: string } | null; onChange: (v: { label: string; href: string } | null) => void }) {
  return (
    <fieldset className="space-y-2 rounded-lg border border-slate-200 p-3">
      <legend className="px-1 text-sm font-medium text-slate-800">Button</legend>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={value !== null} onChange={(e) => onChange(e.target.checked ? { label: "Shop now", href: "/products" } : null)} /> Show a button
      </label>
      {value ? (
        <div className="grid gap-2 sm:grid-cols-2">
          <DashField id={`${id}-label`} label="Button text">
            <input id={`${id}-label`} className={dashInput} maxLength={40} value={value.label} onChange={(e) => onChange({ ...value, label: e.target.value })} />
          </DashField>
          <DashField id={`${id}-href`} label="Goes to" hint="e.g. /products or /collections/new-in">
            <input id={`${id}-href`} className={dashInput} value={value.href} onChange={(e) => onChange({ ...value, href: e.target.value })} aria-describedby={`${id}-href-hint`} />
          </DashField>
        </div>
      ) : null}
    </fieldset>
  );
}

function SectionFields({ section, onChange, slug, collections }: { section: SiteSection; onChange: (s: SiteSection) => void; slug: string; collections: TabProps["state"]["collections"] }) {
  const id = `sec-${section.id}`;
  const text = (key: string, label: string, value: string, max: number, multiline = false, hint?: string) => (
    <DashField id={`${id}-${key}`} label={label} hint={hint}>
      {multiline ? (
        <textarea id={`${id}-${key}`} className={dashInput} rows={3} maxLength={max} value={value} onChange={(e) => onChange({ ...section, [key]: e.target.value } as SiteSection)} />
      ) : (
        <input id={`${id}-${key}`} className={dashInput} maxLength={max} value={value} onChange={(e) => onChange({ ...section, [key]: e.target.value } as SiteSection)} />
      )}
    </DashField>
  );
  const collectionPicker = (ids: string[], max: number) => (
    <fieldset>
      <legend className="mb-1 text-sm font-medium text-slate-800">Collections to show</legend>
      {collections.length === 0 ? (
        <p className="text-sm text-slate-500">You haven&rsquo;t made any collections yet, so your product categories are shown instead.</p>
      ) : (
        <>
          <p className="mb-1 text-xs text-slate-500">Leave all unticked to show your first {max}.</p>
          {collections.map((c) => (
            <label key={c.id} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={ids.includes(c.id)}
                disabled={!ids.includes(c.id) && ids.length >= max}
                onChange={(e) => onChange({ ...section, collectionIds: e.target.checked ? [...ids, c.id] : ids.filter((x) => x !== c.id) } as SiteSection)}
              />
              {c.name}
            </label>
          ))}
        </>
      )}
    </fieldset>
  );

  switch (section.type) {
    case "hero":
      return (
        <div className="space-y-3">
          {text("eyebrow", "Small line above the heading", section.eyebrow, 60)}
          {text("heading", "Heading", section.heading, 120)}
          {text("text", "Text", section.text, 400, true)}
          <LinkFields id={`${id}-cta`} value={section.primaryCta} onChange={(primaryCta) => onChange({ ...section, primaryCta })} />
          <ImagePicker
            id={`${id}-image`}
            label="Banner image"
            slug={slug}
            url={section.image?.url ?? null}
            onChange={(url) => onChange({ ...section, image: url ? { url, alt: section.image?.alt ?? "" } : null })}
            alt={section.image?.alt}
            onAltChange={(alt) => section.image && onChange({ ...section, image: { ...section.image, alt } })}
          />
        </div>
      );
    case "value-strip":
      return (
        <div className="space-y-3">
          {section.items.map((item, i) => (
            <fieldset key={i} className="space-y-2 rounded-lg border border-slate-200 p-3">
              <legend className="px-1 text-sm font-medium text-slate-800">Reason {i + 1}</legend>
              <DashField id={`${id}-icon-${i}`} label="Icon">
                <select id={`${id}-icon-${i}`} className={dashInput} value={item.icon} onChange={(e) => onChange({ ...section, items: section.items.map((it, j) => (j === i ? { ...it, icon: e.target.value } : it)) })}>
                  {ICONS.map((ic) => (
                    <option key={ic} value={ic}>
                      {ic}
                    </option>
                  ))}
                </select>
              </DashField>
              <DashField id={`${id}-title-${i}`} label="Title">
                <input id={`${id}-title-${i}`} className={dashInput} maxLength={60} value={item.title} onChange={(e) => onChange({ ...section, items: section.items.map((it, j) => (j === i ? { ...it, title: e.target.value } : it)) })} />
              </DashField>
              <DashField id={`${id}-text-${i}`} label="Text">
                <input id={`${id}-text-${i}`} className={dashInput} maxLength={160} value={item.text} onChange={(e) => onChange({ ...section, items: section.items.map((it, j) => (j === i ? { ...it, text: e.target.value } : it)) })} />
              </DashField>
              <button type="button" onClick={() => onChange({ ...section, items: section.items.filter((_, j) => j !== i) })} className="text-sm text-slate-600 hover:text-red-700">
                Remove this reason
              </button>
            </fieldset>
          ))}
          {section.items.length < 6 ? (
            <button type="button" onClick={() => onChange({ ...section, items: [...section.items, { icon: "check", title: "New reason", text: "" }] })} className="text-sm font-medium text-blue-700 hover:underline">
              Add a reason
            </button>
          ) : null}
        </div>
      );
    case "category-tiles":
      return (
        <div className="space-y-3">
          {text("heading", "Heading", section.heading, 120)}
          {collectionPicker(section.collectionIds, 8)}
        </div>
      );
    case "featured-collections":
      return (
        <div className="space-y-3">
          {text("heading", "Heading (for screen readers if left empty)", section.heading, 120)}
          {collectionPicker(section.collectionIds, 4)}
        </div>
      );
    case "product-list":
      return (
        <div className="space-y-3">
          {text("heading", "Heading", section.heading, 120)}
          <DashField id={`${id}-source`} label="Which products">
            <select id={`${id}-source`} className={dashInput} value={section.source} onChange={(e) => onChange({ ...section, source: e.target.value as typeof section.source })}>
              {PRODUCT_LIST_SOURCES.map((s) => (
                <option key={s} value={s}>
                  {SOURCE_LABELS[s]}
                </option>
              ))}
            </select>
          </DashField>
          {section.source === "collection" ? (
            <DashField id={`${id}-collection`} label="Collection">
              <select id={`${id}-collection`} className={dashInput} value={section.collectionId ?? ""} onChange={(e) => onChange({ ...section, collectionId: e.target.value || null })}>
                <option value="">Choose a collection</option>
                {collections.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </DashField>
          ) : null}
          <DashField id={`${id}-limit`} label="How many to show">
            <input id={`${id}-limit`} type="number" min={2} max={24} className={dashInput} value={section.limit} onChange={(e) => onChange({ ...section, limit: Math.min(24, Math.max(2, Number(e.target.value) || 2)) })} />
          </DashField>
          <p className="text-xs text-slate-500">Mark products as featured, new or bestsellers on the Products page. The row hides itself when nothing matches.</p>
        </div>
      );
    case "promo":
      return (
        <div className="space-y-3">
          {text("eyebrow", "Small line above the heading", section.eyebrow, 60)}
          {text("heading", "Heading", section.heading, 120)}
          {text("text", "Text", section.text, 400, true)}
          <LinkFields id={`${id}-cta`} value={section.cta} onChange={(cta) => onChange({ ...section, cta })} />
          <ImagePicker
            id={`${id}-image`}
            label="Image"
            slug={slug}
            url={section.image?.url ?? null}
            onChange={(url) => onChange({ ...section, image: url ? { url, alt: section.image?.alt ?? "" } : null })}
            alt={section.image?.alt}
            onAltChange={(alt) => section.image && onChange({ ...section, image: { ...section.image, alt } })}
          />
          <DashField id={`${id}-ends`} label="Ends at (optional)" hint="Shows a countdown on templates that have one, and hides the promotion once it ends.">
            <input
              id={`${id}-ends`}
              type="datetime-local"
              className={dashInput}
              value={section.endsAt ? section.endsAt.slice(0, 16) : ""}
              onChange={(e) => onChange({ ...section, endsAt: e.target.value ? new Date(e.target.value).toISOString() : null })}
              aria-describedby={`${id}-ends-hint`}
            />
          </DashField>
        </div>
      );
    case "reviews":
      return (
        <div className="space-y-3">
          {text("heading", "Heading", section.heading, 120)}
          <p className="text-xs text-slate-500">Shows your latest 4 and 5 star reviews with a written comment. Hidden until you have some.</p>
        </div>
      );
    case "press":
      return (
        <div className="space-y-3">
          {text("heading", "Heading", section.heading, 60)}
          <DashField id={`${id}-names`} label="Publications, one per line" hint="Only list publications that have genuinely featured you.">
            <textarea
              id={`${id}-names`}
              className={dashInput}
              rows={4}
              value={section.names.join("\n")}
              onChange={(e) => onChange({ ...section, names: e.target.value.split("\n").map((n) => n.trim()).filter(Boolean).slice(0, 8) })}
              aria-describedby={`${id}-names-hint`}
            />
          </DashField>
        </div>
      );
    case "gallery":
      return (
        <div className="space-y-3">
          {text("heading", "Heading", section.heading, 120)}
          {section.images.map((img, i) => (
            <ImagePicker
              key={i}
              id={`${id}-img-${i}`}
              label={`Photo ${i + 1}`}
              slug={slug}
              url={img.url}
              onChange={(url) => onChange({ ...section, images: url ? section.images.map((x, j) => (j === i ? { ...x, url } : x)) : section.images.filter((_, j) => j !== i) })}
              alt={img.alt}
              onAltChange={(alt) => onChange({ ...section, images: section.images.map((x, j) => (j === i ? { ...x, alt } : x)) })}
            />
          ))}
          {section.images.length < 12 ? (
            <ImagePicker id={`${id}-new`} label="Add a photo" slug={slug} url={null} onChange={(url) => url && onChange({ ...section, images: [...section.images, { url, alt: "" }] })} decorative />
          ) : null}
        </div>
      );
    default:
      return <p className="text-sm text-slate-500">This section isn&rsquo;t available yet. It stays hidden on your shop.</p>;
  }
}

/** Find the first problem that would stop the homepage saving, in words a merchant understands. */
function firstProblem(sections: SiteSection[]) {
  for (const [i, s] of sections.entries()) {
    const label = `${SECTION_LABELS[s.type]} (section ${i + 1})`;
    if ("image" in s && s.image && !s.image.alt.trim()) return `${label}: describe the image.`;
    if (s.type === "gallery" && s.images.some((img) => !img.alt.trim())) return `${label}: describe every photo.`;
    const parsed = sectionSchema.safeParse(s);
    if (!parsed.success) return `${label}: ${parsed.error.issues[0]?.message ?? "check this section."}`;
  }
  return null;
}

export default function HomepageTab({ slug, state, saving, saveDraft }: TabProps) {
  const [sections, setSections] = useState<SiteSection[]>(state.resolved.sections);
  const [open, setOpen] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [problem, setProblem] = useState("");

  const update = (i: number, s: SiteSection) => setSections((all) => all.map((x, j) => (j === i ? s : x)));
  const move = (i: number, dir: -1 | 1) =>
    setSections((all) => {
      const next = [...all];
      [next[i], next[i + dir]] = [next[i + dir], next[i]];
      return next;
    });

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    const p = firstProblem(sections);
    setProblem(p ?? "");
    if (!p) void saveDraft({ patch: { sections } });
  };

  return (
    <form onSubmit={save} className="space-y-4" noValidate>
      <p className="text-sm text-slate-600">Sections appear on your homepage in this order. Sections with nothing to show, such as a product row with no matching products, stay hidden.</p>
      <DashAlert message={problem} />
      <ol className="space-y-2">
        {sections.map((s, i) => {
          const expanded = open === s.id;
          return (
            <li key={s.id} className="rounded-xl border border-slate-200">
              <div className="flex items-center gap-2 px-3 py-2">
                <button type="button" onClick={() => setOpen(expanded ? null : s.id)} aria-expanded={expanded} className="flex flex-1 items-center gap-2 text-left text-sm font-medium text-slate-900">
                  {expanded ? <ChevronDown className="h-4 w-4" aria-hidden /> : <ChevronRight className="h-4 w-4" aria-hidden />}
                  {SECTION_LABELS[s.type]}
                  {!s.enabled ? <span className="text-xs font-normal text-slate-500">(hidden)</span> : null}
                </button>
                <label className="flex items-center gap-1 text-xs text-slate-600">
                  <input type="checkbox" checked={s.enabled} onChange={(e) => update(i, { ...s, enabled: e.target.checked })} /> Show
                </label>
                <button type="button" onClick={() => move(i, -1)} disabled={i === 0} className="rounded p-1 text-slate-600 hover:bg-slate-100 disabled:opacity-30">
                  <ArrowUp className="h-4 w-4" aria-hidden />
                  <span className="sr-only">Move {SECTION_LABELS[s.type]} up</span>
                </button>
                <button type="button" onClick={() => move(i, 1)} disabled={i === sections.length - 1} className="rounded p-1 text-slate-600 hover:bg-slate-100 disabled:opacity-30">
                  <ArrowDown className="h-4 w-4" aria-hidden />
                  <span className="sr-only">Move {SECTION_LABELS[s.type]} down</span>
                </button>
                <button
                  type="button"
                  onClick={() => window.confirm(`Remove the “${SECTION_LABELS[s.type]}” section?`) && setSections((all) => all.filter((_, j) => j !== i))}
                  className="rounded p-1 text-slate-600 hover:bg-red-50 hover:text-red-700"
                >
                  <Trash2 className="h-4 w-4" aria-hidden />
                  <span className="sr-only">Remove {SECTION_LABELS[s.type]}</span>
                </button>
              </div>
              {expanded ? (
                <div className="border-t border-slate-200 p-3">
                  <SectionFields section={s} onChange={(next) => update(i, next)} slug={slug} collections={state.collections} />
                </div>
              ) : null}
            </li>
          );
        })}
      </ol>

      {adding ? (
        <div className="rounded-xl border border-slate-200 p-3">
          <p className="mb-2 text-sm font-medium text-slate-800">Add a section</p>
          <div className="flex flex-wrap gap-2">
            {ADDABLE.map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => {
                  const s = newSection(type);
                  setSections((all) => [...all, s]);
                  setOpen(s.id);
                  setAdding(false);
                }}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50"
              >
                {SECTION_LABELS[type]}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => setAdding(true)} className="inline-flex items-center gap-1 text-sm font-medium text-blue-700 hover:underline">
          <Plus className="h-4 w-4" aria-hidden /> Add a section
        </button>
      )}

      <div>
        <button type="submit" disabled={saving} className="rounded-xl bg-xyvoo-blue px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
          {saving ? "Saving…" : "Save homepage"}
        </button>
      </div>
    </form>
  );
}

import { z } from "zod";
import { HEX_COLOUR_PATTERN } from "./contrast";
import { FONT_PAIRING_IDS } from "./fonts";

/**
 * Shape of store.sites.draft / store.sites.published.
 *
 * Both columns hold only the merchant's overrides; every field is optional and
 * resolveSite() fills the gaps from the template's defaults. Arrays (sections,
 * menus) replace the default wholesale rather than merging item by item.
 */

const hex = z.string().regex(HEX_COLOUR_PATTERN, "Use a six-digit hex colour, e.g. #7A4E2D.");
const text = (max: number) => z.string().trim().max(max);
/** Relative store path ("/collections/sofas") or an absolute https URL. */
const href = z
  .string()
  .trim()
  .max(500)
  .refine((v) => v.startsWith("/") || /^https:\/\//.test(v), "Links must start with / or https://");
const imageUrl = z.string().trim().url().max(1000);

export const THEME_COLOUR_KEYS = ["bg", "surface", "ink", "muted", "accent", "accentHover", "dark", "onDark"] as const;
export type ThemeColourKey = (typeof THEME_COLOUR_KEYS)[number];

export const BUTTON_SHAPES = ["square", "rounded", "pill"] as const;
export const CORNER_STYLES = ["square", "soft", "round"] as const;
export const CARD_VARIANTS = ["basket", "view", "icons"] as const;

export const themeSchema = z.object({
  colours: z.object(Object.fromEntries(THEME_COLOUR_KEYS.map((k) => [k, hex.optional()])) as Record<ThemeColourKey, z.ZodOptional<typeof hex>>),
  fontPairing: z.enum(FONT_PAIRING_IDS),
  buttonShape: z.enum(BUTTON_SHAPES),
  cornerStyle: z.enum(CORNER_STYLES),
  cardVariant: z.enum(CARD_VARIANTS),
});

export const brandSchema = z.object({
  logoUrl: imageUrl.nullable(),
  logoAlt: text(120),
  faviconUrl: imageUrl.nullable(),
  tagline: text(140),
});

const cta = z.object({ label: text(40).min(1), href });
const image = z.object({ url: imageUrl, alt: text(200) });

const sectionBase = { id: z.string().min(1).max(40), enabled: z.boolean() };

export const SECTION_TYPES = [
  "hero",
  "value-strip",
  "category-tiles",
  "featured-collections",
  "product-list",
  "promo",
  "reviews",
  "journal",
  "press",
  "gallery",
  "newsletter",
] as const;

export const PRODUCT_LIST_SOURCES = ["featured", "new-arrival", "best-seller", "on-sale", "collection"] as const;

export const sectionSchema = z.discriminatedUnion("type", [
  z.object({
    ...sectionBase,
    type: z.literal("hero"),
    eyebrow: text(60),
    heading: text(120).min(1),
    text: text(400),
    primaryCta: cta.nullable(),
    secondaryCta: cta.nullable(),
    image: image.nullable(),
  }),
  z.object({
    ...sectionBase,
    type: z.literal("value-strip"),
    items: z.array(z.object({ icon: text(40), title: text(60).min(1), text: text(160) })).max(6),
  }),
  z.object({
    ...sectionBase,
    type: z.literal("category-tiles"),
    heading: text(120),
    /** Collection ids to show; empty means the first visible collections. */
    collectionIds: z.array(z.string().uuid()).max(8),
  }),
  z.object({
    ...sectionBase,
    type: z.literal("featured-collections"),
    heading: text(120),
    collectionIds: z.array(z.string().uuid()).max(4),
  }),
  z.object({
    ...sectionBase,
    type: z.literal("product-list"),
    heading: text(120).min(1),
    source: z.enum(PRODUCT_LIST_SOURCES),
    collectionId: z.string().uuid().nullable(),
    limit: z.number().int().min(2).max(24),
  }),
  z.object({
    ...sectionBase,
    type: z.literal("promo"),
    eyebrow: text(60),
    heading: text(120).min(1),
    text: text(400),
    cta: cta.nullable(),
    image: image.nullable(),
    /** Optional countdown end, ISO date-time. */
    endsAt: z.string().datetime().nullable(),
  }),
  z.object({ ...sectionBase, type: z.literal("reviews"), heading: text(120).min(1) }),
  z.object({ ...sectionBase, type: z.literal("journal"), heading: text(120).min(1) }),
  z.object({
    ...sectionBase,
    type: z.literal("press"),
    heading: text(60),
    names: z.array(text(60).min(1)).max(8),
  }),
  z.object({
    ...sectionBase,
    type: z.literal("gallery"),
    heading: text(120),
    images: z.array(image).max(12),
  }),
  z.object({
    ...sectionBase,
    type: z.literal("newsletter"),
    heading: text(120).min(1),
    text: text(300),
    note: text(200),
  }),
]);

export type SiteSection = z.infer<typeof sectionSchema>;
export type SiteSectionType = SiteSection["type"];

export const MENU_LINK_TYPES = ["home", "shop", "collection", "product", "page", "url"] as const;

export const menuItemSchema = z.object({
  label: text(40).min(1),
  type: z.enum(MENU_LINK_TYPES),
  /** Collection/product/page slug, or the URL for type "url". Empty for home and shop. */
  target: text(500),
});

export const navigationSchema = z.object({
  header: z.array(menuItemSchema).max(8),
  footer: z.array(z.object({ title: text(40).min(1), items: z.array(menuItemSchema).max(8) })).max(4),
  showSocialIcons: z.boolean(),
});

const pageCopy = z.object({ title: text(80), description: text(300), lead: text(300) });

export const contentSchema = z.object({
  announcement: z.object({ text: text(120), href: href.nullable() }),
  footerBlurb: text(300),
  copyright: text(120),
  shop: pageCopy.partial(),
  collections: pageCopy.partial(),
  journal: pageCopy.partial(),
});

export const seoSchema = z.object({
  title: text(70),
  description: text(160),
  shareImageUrl: imageUrl.nullable(),
  googleAnalyticsId: z.string().trim().regex(/^G-[A-Z0-9]{4,12}$/, "Use a Google Analytics ID like G-XXXXXXX.").nullable(),
  metaPixelId: z.string().trim().regex(/^[0-9]{6,20}$/, "Meta Pixel IDs are numbers only.").nullable(),
});

export const siteOverridesSchema = z.object({
  theme: themeSchema.extend({ colours: themeSchema.shape.colours.partial() }).partial(),
  brand: brandSchema.partial(),
  sections: z.array(sectionSchema).max(20),
  navigation: navigationSchema.partial(),
  content: contentSchema.extend({ announcement: contentSchema.shape.announcement.partial() }).partial(),
  seo: seoSchema.partial(),
}).partial();

export type SiteOverrides = z.infer<typeof siteOverridesSchema>;
export type SiteTheme = Omit<z.infer<typeof themeSchema>, "colours"> & { colours: Record<ThemeColourKey, string> };
export type SiteBrand = z.infer<typeof brandSchema>;
export type SiteNavigation = z.infer<typeof navigationSchema>;
export type SiteContent = Omit<z.infer<typeof contentSchema>, "shop" | "collections" | "journal"> & {
  shop: z.infer<typeof pageCopy>;
  collections: z.infer<typeof pageCopy>;
  journal: z.infer<typeof pageCopy>;
};
export type SiteSeo = z.infer<typeof seoSchema>;

/**
 * Parses stored overrides. Stored JSON that no longer validates (e.g. after a
 * schema change) is dropped section by section rather than breaking the site.
 */
export function parseSiteOverrides(value: unknown): SiteOverrides {
  const parsed = siteOverridesSchema.safeParse(value ?? {});
  if (parsed.success) return parsed.data;

  const raw = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(siteOverridesSchema.shape) as (keyof typeof siteOverridesSchema.shape)[]) {
    const field = siteOverridesSchema.shape[key].safeParse(raw[key]);
    if (field.success && field.data !== undefined) result[key] = field.data;
  }
  return result as SiteOverrides;
}

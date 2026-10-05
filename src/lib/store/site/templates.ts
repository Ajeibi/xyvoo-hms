import type { FontPairingId } from "./fonts";
import type { SiteSection, SiteTheme } from "./schema";

/**
 * Storefront templates a merchant can build on. Theme values are taken from
 * design/storefront-templates/<slug>/theme.css (Linden Home uses the
 * _base/base.css defaults). Section order mirrors each template's home page.
 * Default copy is deliberately neutral: the merchant's own words replace it,
 * and nothing here should read as if it were written about their business.
 */
export type StorefrontTemplateDefinition = {
  slug: StorefrontTemplateSlug;
  name: string;
  theme: SiteTheme;
  /** Pairings offered first in the brand step; any pairing is allowed. */
  recommendedFonts: FontPairingId[];
  /** Merchant categories this template is suggested for in the wizard. */
  suggestedFor: StoreCategory[];
  sections: SiteSection[];
};

export const STORE_CATEGORIES = ["fashion", "beauty", "home", "food", "electronics", "other"] as const;
export type StoreCategory = (typeof STORE_CATEGORIES)[number];

export const STOREFRONT_TEMPLATE_SLUGS = ["linden-home", "sage-and-stem", "loftwood"] as const;
export type StorefrontTemplateSlug = (typeof STOREFRONT_TEMPLATE_SLUGS)[number];

export const DEFAULT_TEMPLATE_SLUG: StorefrontTemplateSlug = "linden-home";

const hero = (heading: string): SiteSection => ({
  id: "hero",
  type: "hero",
  enabled: true,
  eyebrow: "",
  heading,
  text: "Add a sentence or two about what you sell and why customers love it.",
  primaryCta: { label: "Shop now", href: "/products" },
  secondaryCta: null,
  image: null,
});

const valueStrip: SiteSection = {
  id: "values",
  type: "value-strip",
  enabled: true,
  items: [
    { icon: "truck", title: "Fast delivery", text: "Tell customers how quickly orders arrive." },
    { icon: "shield", title: "Secure payment", text: "Pay safely by card or bank transfer." },
    { icon: "refresh", title: "Easy returns", text: "Explain your returns promise." },
  ],
};

const productList = (id: string, heading: string, source: "featured" | "new-arrival" | "best-seller" | "on-sale"): SiteSection => ({
  id,
  type: "product-list",
  enabled: true,
  heading,
  source,
  collectionId: null,
  limit: 8,
});

// Off by default until subscribers can be stored; a sign-up form that goes nowhere would mislead shoppers.
const newsletter: SiteSection = {
  id: "newsletter",
  type: "newsletter",
  enabled: false,
  heading: "Join our mailing list",
  text: "Be the first to hear about new arrivals and offers.",
  note: "You can unsubscribe at any time.",
};

const reviews: SiteSection = { id: "reviews", type: "reviews", enabled: true, heading: "What our customers say" };
// Off by default: there is no blog yet, so the section would render empty.
const journal: SiteSection = { id: "journal", type: "journal", enabled: false, heading: "From the journal" };

export const STOREFRONT_TEMPLATES: Record<StorefrontTemplateSlug, StorefrontTemplateDefinition> = {
  "linden-home": {
    slug: "linden-home",
    name: "Linden Home",
    theme: {
      colours: {
        bg: "#FAF7F2",
        surface: "#F6F1EA",
        ink: "#2A241E",
        muted: "#5E544A",
        accent: "#7A4E2D",
        accentHover: "#5F3B20",
        dark: "#3B3731",
        onDark: "#FFFFFF",
      },
      fontPairing: "jost-dm-sans",
      buttonShape: "square",
      cornerStyle: "square",
      cardVariant: "basket",
    },
    recommendedFonts: ["jost-dm-sans", "playfair-source-sans", "fraunces-inter"],
    suggestedFor: ["home", "other"],
    sections: [
      hero("Welcome to our store"),
      valueStrip,
      { id: "categories", type: "category-tiles", enabled: true, heading: "Shop by category", collectionIds: [] },
      { id: "featured", type: "featured-collections", enabled: true, heading: "", collectionIds: [] },
      productList("bestsellers", "Our most loved", "best-seller"),
      reviews,
      journal,
      newsletter,
    ],
  },
  "sage-and-stem": {
    slug: "sage-and-stem",
    name: "Sage and Stem",
    theme: {
      colours: {
        bg: "#FBF8EF",
        surface: "#F4F1E4",
        ink: "#232817",
        muted: "#585C49",
        accent: "#4F5D2F",
        accentHover: "#3E4A23",
        dark: "#2F3A1C",
        onDark: "#FFFFFF",
      },
      fontPairing: "dm-serif-dm-sans",
      buttonShape: "rounded",
      cornerStyle: "round",
      cardVariant: "view",
    },
    recommendedFonts: ["dm-serif-dm-sans", "fraunces-inter", "playfair-source-sans"],
    suggestedFor: ["beauty", "food", "fashion"],
    sections: [
      hero("Welcome to our store"),
      productList("featured", "Featured collection", "featured"),
      {
        id: "promo",
        type: "promo",
        enabled: true,
        eyebrow: "",
        heading: "Your new favourite",
        text: "Highlight one product or offer you want every visitor to see.",
        cta: { label: "Shop now", href: "/products" },
        image: null,
        endsAt: null,
      },
      { id: "categories", type: "category-tiles", enabled: true, heading: "", collectionIds: [] },
      valueStrip,
      reviews,
      journal,
      newsletter,
    ],
  },
  loftwood: {
    slug: "loftwood",
    name: "Loftwood",
    theme: {
      colours: {
        bg: "#FFFFFF",
        surface: "#F5F5F3",
        ink: "#1B1F1C",
        muted: "#5C635D",
        accent: "#0B4A2B",
        accentHover: "#083620",
        dark: "#0B3D24",
        onDark: "#FFFFFF",
      },
      fontPairing: "plus-jakarta",
      buttonShape: "pill",
      cornerStyle: "soft",
      cardVariant: "icons",
    },
    recommendedFonts: ["plus-jakarta", "fraunces-inter", "jost-dm-sans"],
    suggestedFor: ["electronics", "home", "fashion"],
    sections: [
      hero("Welcome to our store"),
      valueStrip,
      { id: "categories", type: "category-tiles", enabled: true, heading: "Shop by category", collectionIds: [] },
      productList("new-arrivals", "New arrivals", "new-arrival"),
      {
        id: "sale",
        type: "promo",
        enabled: false,
        eyebrow: "Limited time",
        heading: "Sale now on",
        text: "Set an end date to show a countdown.",
        cta: { label: "Shop the sale", href: "/products" },
        image: null,
        endsAt: null,
      },
      productList("deals", "Deals of the day", "on-sale"),
      reviews,
      journal,
      newsletter,
    ],
  },
};

export function isStorefrontTemplateSlug(value: unknown): value is StorefrontTemplateSlug {
  return typeof value === "string" && (STOREFRONT_TEMPLATE_SLUGS as readonly string[]).includes(value);
}

export function getStorefrontTemplate(slug: string | null | undefined): StorefrontTemplateDefinition {
  return STOREFRONT_TEMPLATES[isStorefrontTemplateSlug(slug) ? slug : DEFAULT_TEMPLATE_SLUG];
}

export function suggestTemplateFor(category: StoreCategory | null | undefined): StorefrontTemplateSlug {
  if (!category) return DEFAULT_TEMPLATE_SLUG;
  return STOREFRONT_TEMPLATE_SLUGS.find((slug) => STOREFRONT_TEMPLATES[slug].suggestedFor.includes(category)) ?? DEFAULT_TEMPLATE_SLUG;
}

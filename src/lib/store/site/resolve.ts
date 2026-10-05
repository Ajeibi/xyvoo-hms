import { contrastRatio, darken, MIN_TEXT_CONTRAST } from "./contrast";
import { fontStack, getFontPairing } from "./fonts";
import type {
  SiteBrand,
  SiteContent,
  SiteNavigation,
  SiteOverrides,
  SiteSection,
  SiteSeo,
  SiteTheme,
  ThemeColourKey,
} from "./schema";
import { getStorefrontTemplate, type StorefrontTemplateDefinition } from "./templates";

export type ResolveSiteContext = {
  storeName: string;
  /** Fallback when the site has no logo of its own (tenants.logo_url). */
  tenantLogoUrl?: string | null;
  /** Injected for deterministic tests; defaults to the current year. */
  year?: number;
};

export type ContrastIssue = { foreground: string; background: string; label: string; ratio: number };

export type ResolvedSite = {
  template: StorefrontTemplateDefinition;
  theme: SiteTheme & { onAccent: string };
  brand: SiteBrand;
  sections: SiteSection[];
  navigation: SiteNavigation;
  content: SiteContent;
  seo: SiteSeo;
  /** CSS custom properties for the template stylesheet, set on the store's root element. */
  cssVariables: Record<`--${string}`, string>;
  contrastIssues: ContrastIssue[];
};

const BUTTON_RADIUS = { square: "0", rounded: "0.375rem", pill: "999px" } as const;
const CORNER_RADIUS = {
  square: { card: "0", media: "0", field: "0" },
  soft: { card: "1rem", media: "1rem", field: "0.75rem" },
  round: { card: "1.25rem", media: "1.25rem", field: "0.5rem" },
} as const;

const WHITE = "#FFFFFF";

function resolveTheme(template: StorefrontTemplateDefinition, overrides: SiteOverrides["theme"]): ResolvedSite["theme"] {
  const custom = overrides?.colours ?? {};
  const colours = { ...template.theme.colours, ...custom } as Record<ThemeColourKey, string>;
  if (custom.accent && !custom.accentHover) colours.accentHover = darken(custom.accent, 0.18);

  const onAccent = contrastRatio(WHITE, colours.accent) >= MIN_TEXT_CONTRAST ? WHITE : colours.ink;

  return {
    ...template.theme,
    ...overrides,
    colours,
    onAccent,
  };
}

function checkContrast(theme: ResolvedSite["theme"]): ContrastIssue[] {
  const { colours } = theme;
  const pairs: [string, string, string][] = [
    [colours.ink, colours.bg, "Text on the page background"],
    [colours.muted, colours.bg, "Secondary text on the page background"],
    [colours.ink, colours.surface, "Text on panels"],
    [theme.onAccent, colours.accent, "Button text on the accent colour"],
    [colours.onDark, colours.dark, "Text on dark bands and the footer"],
  ];

  return pairs
    .map(([foreground, background, label]) => ({ foreground, background, label, ratio: contrastRatio(foreground, background) }))
    .filter((pair) => pair.ratio < MIN_TEXT_CONTRAST)
    .map((pair) => ({ ...pair, ratio: Math.round(pair.ratio * 100) / 100 }));
}

function toCssVariables(theme: ResolvedSite["theme"]): ResolvedSite["cssVariables"] {
  const { colours } = theme;
  const fonts = getFontPairing(theme.fontPairing);
  const corners = CORNER_RADIUS[theme.cornerStyle];

  return {
    "--bg": colours.bg,
    "--surface": colours.surface,
    "--ink": colours.ink,
    "--muted": colours.muted,
    "--accent": colours.accent,
    "--accent-hover": colours.accentHover,
    "--on-accent": theme.onAccent,
    "--dark": colours.dark,
    "--on-dark": colours.onDark,
    "--font-display": fontStack(fonts.display),
    "--font-body": fontStack(fonts.body),
    "--display-weight": String(fonts.display.weight),
    "--btn-radius": BUTTON_RADIUS[theme.buttonShape],
    "--card-radius": corners.card,
    "--media-radius": corners.media,
    "--field-radius": corners.field,
  };
}

function defaultNavigation(): SiteNavigation {
  return {
    header: [
      { label: "Home", type: "home", target: "" },
      { label: "Shop", type: "shop", target: "" },
      { label: "About", type: "page", target: "about" },
      { label: "Contact", type: "page", target: "contact" },
    ],
    footer: [
      { title: "Shop", items: [{ label: "All products", type: "shop", target: "" }] },
      {
        title: "Help",
        items: [
          { label: "Delivery and returns", type: "page", target: "delivery-returns" },
          { label: "FAQs", type: "page", target: "faqs" },
          { label: "Contact us", type: "page", target: "contact" },
        ],
      },
      {
        title: "Legal",
        items: [
          { label: "Privacy policy", type: "page", target: "privacy" },
          { label: "Terms and conditions", type: "page", target: "terms" },
        ],
      },
    ],
    showSocialIcons: true,
  };
}

export function resolveSite(templateSlug: string | null | undefined, overrides: SiteOverrides, ctx: ResolveSiteContext): ResolvedSite {
  const template = getStorefrontTemplate(templateSlug);
  const theme = resolveTheme(template, overrides.theme);
  const year = ctx.year ?? new Date().getFullYear();

  const brand: SiteBrand = {
    logoUrl: ctx.tenantLogoUrl ?? null,
    logoAlt: ctx.storeName,
    faviconUrl: null,
    tagline: "",
    ...overrides.brand,
  };

  const content: SiteContent = {
    announcement: { text: "", href: null, ...overrides.content?.announcement },
    footerBlurb: overrides.content?.footerBlurb ?? brand.tagline,
    copyright: overrides.content?.copyright ?? `© ${year} ${ctx.storeName}`,
    shop: { title: "Shop", description: "", lead: "", ...overrides.content?.shop },
    collections: { title: "Collections", description: "", lead: "", ...overrides.content?.collections },
    journal: { title: "Journal", description: "", lead: "", ...overrides.content?.journal },
  };

  const seo: SiteSeo = {
    title: ctx.storeName,
    description: brand.tagline,
    shareImageUrl: null,
    googleAnalyticsId: null,
    metaPixelId: null,
    ...overrides.seo,
  };

  return {
    template,
    theme,
    brand,
    sections: overrides.sections ?? template.sections,
    navigation: { ...defaultNavigation(), ...overrides.navigation },
    content,
    seo,
    cssVariables: toCssVariables(theme),
    contrastIssues: checkContrast(theme),
  };
}

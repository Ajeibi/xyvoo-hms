/**
 * Curated heading/body font pairings a merchant can choose from. Every family
 * is self-hosted through next/font (see next-fonts.ts), so storefronts never
 * load fonts from a third-party host, and only the chosen pairing is downloaded.
 */
export const FONT_FAMILY_KEYS = [
  "jost",
  "dmSans",
  "dmSerifDisplay",
  "plusJakarta",
  "fraunces",
  "inter",
  "playfair",
  "sourceSans",
] as const;
export type FontFamilyKey = (typeof FONT_FAMILY_KEYS)[number];

type FontRef = { key: FontFamilyKey; family: string; fallback: string };

export type FontPairing = {
  id: string;
  label: string;
  display: FontRef & { weight: number };
  body: FontRef;
};

const SANS = 'system-ui, -apple-system, "Segoe UI", sans-serif';
const SERIF = 'Georgia, "Times New Roman", serif';

export const FONT_PAIRINGS = [
  {
    id: "jost-dm-sans",
    label: "Jost and DM Sans",
    display: { key: "jost", family: "Jost", fallback: `"Futura", "Century Gothic", ${SANS}`, weight: 500 },
    body: { key: "dmSans", family: "DM Sans", fallback: SANS },
  },
  {
    id: "dm-serif-dm-sans",
    label: "DM Serif Display and DM Sans",
    display: { key: "dmSerifDisplay", family: "DM Serif Display", fallback: SERIF, weight: 400 },
    body: { key: "dmSans", family: "DM Sans", fallback: SANS },
  },
  {
    id: "plus-jakarta",
    label: "Plus Jakarta Sans",
    display: { key: "plusJakarta", family: "Plus Jakarta Sans", fallback: SANS, weight: 700 },
    body: { key: "plusJakarta", family: "Plus Jakarta Sans", fallback: SANS },
  },
  {
    id: "fraunces-inter",
    label: "Fraunces and Inter",
    display: { key: "fraunces", family: "Fraunces", fallback: SERIF, weight: 600 },
    body: { key: "inter", family: "Inter", fallback: SANS },
  },
  {
    id: "playfair-source-sans",
    label: "Playfair Display and Source Sans 3",
    display: { key: "playfair", family: "Playfair Display", fallback: SERIF, weight: 600 },
    body: { key: "sourceSans", family: "Source Sans 3", fallback: SANS },
  },
] as const satisfies readonly FontPairing[];

export type FontPairingId = (typeof FONT_PAIRINGS)[number]["id"];

export const FONT_PAIRING_IDS = FONT_PAIRINGS.map((p) => p.id) as [FontPairingId, ...FontPairingId[]];

export function getFontPairing(id: FontPairingId): FontPairing {
  return FONT_PAIRINGS.find((p) => p.id === id) ?? FONT_PAIRINGS[0];
}

/** CSS custom property next/font defines for a family, e.g. --sf-font-jost. */
export function fontCssVar(key: FontFamilyKey) {
  return `--sf-font-${key}`;
}

export function fontStack(font: FontRef) {
  return `var(${fontCssVar(font.key)}), ${font.fallback}`;
}

// ------------------------------------------------------------- custom fonts

/**
 * A merchant's own font, used for headings (and body text if they choose).
 * Either a Google Font by name, loaded from Google, or a file they uploaded to
 * our storage. Validated by customFontSchema in schema.ts.
 */
export type CustomFont =
  | { source: "google"; family: string; /** Whether the family has bold (700) as well as regular. */ hasBold: boolean; useForBody: boolean }
  | { source: "upload"; /** Shown to the merchant, e.g. the file's name. */ label: string; url: string; format: CustomFontFormat; useForBody: boolean };

export const CUSTOM_FONT_FORMATS = ["woff2", "woff", "truetype", "opentype"] as const;
export type CustomFontFormat = (typeof CUSTOM_FONT_FORMATS)[number];

/** CSS family name for an uploaded font; fixed, so nothing the merchant types ends up in CSS. */
export const UPLOADED_FONT_FAMILY = "sf-custom";

/** Letters, numbers and spaces only, as Google Fonts names are. */
export const GOOGLE_FONT_NAME = /^[A-Za-z0-9][A-Za-z0-9 ]{0,59}$/;

export function googleFontCssUrl(family: string, hasBold: boolean) {
  return `https://fonts.googleapis.com/css2?family=${family.trim().replace(/ /g, "+")}${hasBold ? ":wght@400;700" : ""}&display=swap`;
}

/** The @font-face rule for an uploaded font, or null for a Google Font (which brings its own). */
export function uploadedFontFace(font: CustomFont | null | undefined) {
  if (!font || font.source !== "upload") return null;
  return `@font-face{font-family:"${UPLOADED_FONT_FAMILY}";src:url("${encodeURI(font.url)}") format("${font.format}");font-display:swap}`;
}

export function customFontStack(font: CustomFont, fallback: string) {
  return `"${font.source === "google" ? font.family : UPLOADED_FONT_FAMILY}", ${fallback}`;
}

export function customFontLabel(font: CustomFont) {
  return font.source === "google" ? font.family : font.label;
}

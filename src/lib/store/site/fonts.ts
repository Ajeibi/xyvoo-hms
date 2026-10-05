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

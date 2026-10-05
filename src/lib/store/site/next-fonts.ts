import { DM_Sans, DM_Serif_Display, Fraunces, Inter, Jost, Playfair_Display, Plus_Jakarta_Sans, Source_Sans_3 } from "next/font/google";
import type { FontFamilyKey, FontPairing } from "./fonts";

/*
 * next/font downloads these at build time and serves them from the app, so a
 * storefront makes no request to Google. Variable names must match fontCssVar().
 * preload is off: Next preloads every font a route imports, which would make
 * every store download all eight families (~250 KB) before its own content.
 * Without it the browser fetches only the two its pairing uses. display:
 * optional means text never reflows when a font arrives late (no layout
 * shift); a first visit on a slow connection may show the size-matched
 * fallback, and the store font from the next page on, once it is cached.
 */
// next/font requires every option to be a literal written in the call itself.
const jost = Jost({ subsets: ["latin"], display: "optional", preload: false, variable: "--sf-font-jost" });
const dmSans = DM_Sans({ subsets: ["latin"], display: "optional", preload: false, variable: "--sf-font-dmSans" });
const dmSerifDisplay = DM_Serif_Display({ subsets: ["latin"], display: "optional", preload: false, weight: "400", variable: "--sf-font-dmSerifDisplay" });
const plusJakarta = Plus_Jakarta_Sans({ subsets: ["latin"], display: "optional", preload: false, variable: "--sf-font-plusJakarta" });
const fraunces = Fraunces({ subsets: ["latin"], display: "optional", preload: false, variable: "--sf-font-fraunces" });
const inter = Inter({ subsets: ["latin"], display: "optional", preload: false, variable: "--sf-font-inter" });
const playfair = Playfair_Display({ subsets: ["latin"], display: "optional", preload: false, variable: "--sf-font-playfair" });
const sourceSans = Source_Sans_3({ subsets: ["latin"], display: "optional", preload: false, variable: "--sf-font-sourceSans" });

const FONTS: Record<FontFamilyKey, { variable: string }> = {
  jost,
  dmSans,
  dmSerifDisplay,
  plusJakarta,
  fraunces,
  inter,
  playfair,
  sourceSans,
};

/** Class names that define the CSS variables for a pairing's two families. */
export function fontVariableClasses(pairing: FontPairing) {
  return Array.from(new Set([FONTS[pairing.display.key].variable, FONTS[pairing.body.key].variable])).join(" ");
}

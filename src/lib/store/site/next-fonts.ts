import { DM_Sans, DM_Serif_Display, Fraunces, Inter, Jost, Playfair_Display, Plus_Jakarta_Sans, Source_Sans_3 } from "next/font/google";
import type { FontFamilyKey, FontPairing } from "./fonts";

/*
 * next/font downloads these at build time and serves them from the app, so a
 * storefront makes no request to Google. Variable names must match fontCssVar().
 * Only the fonts whose class is rendered are preloaded, so each store preloads
 * just its chosen pairing.
 */
// next/font requires every option to be a literal written in the call itself.
const jost = Jost({ subsets: ["latin"], display: "swap", variable: "--sf-font-jost" });
const dmSans = DM_Sans({ subsets: ["latin"], display: "swap", variable: "--sf-font-dmSans" });
const dmSerifDisplay = DM_Serif_Display({ subsets: ["latin"], display: "swap", weight: "400", variable: "--sf-font-dmSerifDisplay" });
const plusJakarta = Plus_Jakarta_Sans({ subsets: ["latin"], display: "swap", variable: "--sf-font-plusJakarta" });
const fraunces = Fraunces({ subsets: ["latin"], display: "swap", variable: "--sf-font-fraunces" });
const inter = Inter({ subsets: ["latin"], display: "swap", variable: "--sf-font-inter" });
const playfair = Playfair_Display({ subsets: ["latin"], display: "swap", variable: "--sf-font-playfair" });
const sourceSans = Source_Sans_3({ subsets: ["latin"], display: "swap", variable: "--sf-font-sourceSans" });

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

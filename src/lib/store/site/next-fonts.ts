import localFont from "next/font/local";
import type { FontFamilyKey, FontPairing } from "./fonts";

/*
 * these are self-hosted files (src/app/font-files) served from the app, so a
 * storefront makes no request to Google. Variable names must match fontCssVar().
 * preload is off: Next preloads every font a route imports, which would make
 * every store download all eight families (~250 KB) before its own content.
 * Without it the browser fetches only the two its pairing uses. display:
 * optional means text never reflows when a font arrives late (no layout
 * shift); a first visit on a slow connection may show the size-matched
 * fallback, and the store font from the next page on, once it is cached.
 */
// next/font requires every option to be a literal written in the call itself.
const jost = localFont({ src: "../../../app/font-files/jost-latin-wght-normal.woff2", weight: "100 900", display: "optional", preload: false, variable: "--sf-font-jost" });
const dmSans = localFont({ src: "../../../app/font-files/dm-sans-latin-wght-normal.woff2", weight: "100 1000", display: "optional", preload: false, variable: "--sf-font-dmSans" });
const dmSerifDisplay = localFont({ src: "../../../app/font-files/dm-serif-display-latin-400-normal.woff2", weight: "400", display: "optional", preload: false, variable: "--sf-font-dmSerifDisplay" });
const plusJakarta = localFont({ src: "../../../app/font-files/plus-jakarta-sans-latin-wght-normal.woff2", weight: "200 800", display: "optional", preload: false, variable: "--sf-font-plusJakarta" });
const fraunces = localFont({ src: "../../../app/font-files/fraunces-latin-wght-normal.woff2", weight: "100 900", display: "optional", preload: false, variable: "--sf-font-fraunces" });
const inter = localFont({ src: "../../../app/font-files/inter-latin-wght-normal.woff2", weight: "100 900", display: "optional", preload: false, variable: "--sf-font-inter" });
const playfair = localFont({ src: "../../../app/font-files/playfair-display-latin-wght-normal.woff2", weight: "400 900", display: "optional", preload: false, variable: "--sf-font-playfair" });
const sourceSans = localFont({ src: "../../../app/font-files/source-sans-3-latin-wght-normal.woff2", weight: "200 900", display: "optional", preload: false, variable: "--sf-font-sourceSans" });

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

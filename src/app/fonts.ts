import localFont from "next/font/local";

/*
 * The platform's typefaces, self-hosted from src/app/font-files so the build never
 * calls fonts.googleapis.com (a bad response from Google used to fail the whole
 * deploy). globals.css reads them through these CSS variables. Only Inter (the body
 * face on every page) is preloaded; DM Sans, Exo 2 and Fraunces load when used.
 */
const inter = localFont({
  src: "./font-files/inter-latin-wght-normal.woff2",
  weight: "100 900",
  display: "swap",
  variable: "--font-inter",
});
const dmSans = localFont({
  src: "./font-files/dm-sans-latin-wght-normal.woff2",
  weight: "100 1000",
  display: "swap",
  preload: false,
  variable: "--font-dm-sans",
});
const exo2 = localFont({
  src: [
    { path: "./font-files/exo-2-latin-700-normal.woff2", weight: "700", style: "normal" },
    { path: "./font-files/exo-2-latin-800-normal.woff2", weight: "800", style: "normal" },
  ],
  display: "swap",
  preload: false,
  variable: "--font-exo-2",
});

// Soft, playful italic for the oversized hero watermarks (lowercase words).
const fraunces = localFont({
  src: "./font-files/fraunces-latin-full-italic.woff2",
  weight: "100 900",
  style: "italic",
  display: "swap",
  preload: false,
  variable: "--font-fraunces",
});

/** Put on <html> in each root layout that imports globals.css. */
export const platformFontVariables = `${inter.variable} ${dmSans.variable} ${exo2.variable} ${fraunces.variable}`;

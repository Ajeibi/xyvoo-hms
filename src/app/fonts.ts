import { DM_Sans, Exo_2, Fraunces, Inter } from "next/font/google";

/*
 * The platform's typefaces, self-hosted by next/font so the browser never waits on
 * fonts.googleapis.com before it can paint. globals.css reads them through these
 * CSS variables. Only Inter (the body face on every page) is preloaded; DM Sans and
 * Exo 2 appear in one home-page section and load when it is used.
 */
const inter = Inter({ subsets: ["latin"], display: "swap", variable: "--font-inter" });
const dmSans = DM_Sans({ subsets: ["latin"], display: "swap", preload: false, variable: "--font-dm-sans" });
const exo2 = Exo_2({
  subsets: ["latin"],
  weight: ["700", "800"],
  display: "swap",
  preload: false,
  variable: "--font-exo-2",
});

// Soft, playful italic for the oversized hero watermarks (lowercase words).
const fraunces = Fraunces({
  subsets: ["latin"],
  style: ["italic"],
  axes: ["SOFT", "WONK"],
  display: "swap",
  preload: false,
  variable: "--font-fraunces",
});

/** Put on <html> in each root layout that imports globals.css. */
export const platformFontVariables = `${inter.variable} ${dmSans.variable} ${exo2.variable} ${fraunces.variable}`;

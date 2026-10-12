import * as SimpleIcons from "react-icons/si";
import type { IconType } from "react-icons";

/*
 * Brand logos for social links we don't draw ourselves (Medium, Behance,
 * Spotify, Substack…), from Simple Icons (~3,400 brands, via react-icons).
 * Server only: the whole set is looked up here and just the one logo each
 * link needs ends up in the page as inline SVG.
 */

const INDEX = new Map(
  Object.entries(SimpleIcons)
    .filter(([name]) => name.startsWith("Si"))
    .map(([name, icon]) => [name.slice(2).toLowerCase(), icon as IconType]),
);

/** Domains whose name isn't the brand's name. */
const ALIASES: Record<string, string> = { linktr: "linktree", "discord.gg": "discord", "open.spotify": "spotify", "music.apple": "applemusic", "goo.gl": "google" };

/** Parts of an address that are never the brand. */
const NOT_A_BRAND = new Set(["www", "m", "mobile", "web", "app", "open", "en", "blog", "shop", "store", "my", "go", "co", "com", "net", "org"]);

/** The Simple Icons logo for a link's site, e.g. medium.com → Medium, or null. */
export function brandIconFor(href: string): IconType | null {
  let host: string;
  try {
    host = new URL(href).hostname.toLowerCase();
  } catch {
    return null;
  }
  const labels = host.split(".");
  for (const [domain, brand] of Object.entries(ALIASES)) {
    if (host === domain || host.endsWith(`.${domain}`) || labels.includes(domain)) return INDEX.get(brand) ?? null;
  }
  // "username.substack.com" → substack; "behance.net" → behance. The last label is the country or ".com".
  const candidates = labels.slice(0, -1).filter((l) => !NOT_A_BRAND.has(l)).reverse();
  for (const name of candidates) {
    const icon = INDEX.get(name.replace(/-/g, ""));
    if (icon) return icon;
  }
  return null;
}

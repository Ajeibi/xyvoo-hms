import { z } from "zod";

/*
 * A shop's social pages. The merchant pastes links; we recognise the platform
 * from the address, so there's nothing to choose. Stored on
 * store.business_profile.socials as { instagram: url, …, other: [url, …] }.
 */

export const SOCIAL_PLATFORMS = [
  { key: "instagram", label: "Instagram", hosts: ["instagram.com", "instagr.am"] },
  { key: "facebook", label: "Facebook", hosts: ["facebook.com", "fb.com", "fb.me"] },
  { key: "tiktok", label: "TikTok", hosts: ["tiktok.com"] },
  { key: "x", label: "X (Twitter)", hosts: ["x.com", "twitter.com"] },
  { key: "youtube", label: "YouTube", hosts: ["youtube.com", "youtu.be"] },
  { key: "pinterest", label: "Pinterest", hosts: ["pinterest.com", "pin.it"] },
  { key: "linkedin", label: "LinkedIn", hosts: ["linkedin.com"] },
  { key: "snapchat", label: "Snapchat", hosts: ["snapchat.com"] },
  { key: "threads", label: "Threads", hosts: ["threads.net", "threads.com"] },
  { key: "telegram", label: "Telegram", hosts: ["t.me", "telegram.me"] },
  { key: "whatsapp", label: "WhatsApp", hosts: ["wa.me", "whatsapp.com"] },
] as const;

export type SocialPlatform = (typeof SOCIAL_PLATFORMS)[number]["key"];
export type StoreSocials = Partial<Record<SocialPlatform, string>> & {
  other?: string[];
  /** Copies of other sites' own icons in our storage, by hostname (see social-favicons). */
  icons?: Record<string, string>;
};

export const MAX_SOCIAL_LINKS = 12;

/** A full https link, as the shop's footer needs. */
export const socialLinkSchema = z
  .string()
  .trim()
  .max(300)
  .regex(/^https:\/\/[^\s]+\.[^\s]+$/, "Use a full link starting with https://");

/** Empty rows are allowed (and dropped when saving), so errors line up with the rows on screen. */
export const socialLinksSchema = z
  .array(z.literal("").or(socialLinkSchema))
  .max(MAX_SOCIAL_LINKS)
  .default([]);

function hostOf(url: string) {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^(www|m|mobile)\./, "");
  } catch {
    return null;
  }
}

/** Which platform a link is on, or "other" for any other website. */
export function detectPlatform(url: string): SocialPlatform | "other" | null {
  const host = hostOf(url);
  if (!host) return null;
  const found = SOCIAL_PLATFORMS.find((p) =>
    p.hosts.some((h) => host === h || host.endsWith(`.${h}`) || (h === "pinterest.com" && /^([a-z]{2}\.)?pinterest\.[a-z.]+$/.test(host))),
  );
  return found?.key ?? "other";
}

export function platformLabel(key: SocialPlatform | "other") {
  return SOCIAL_PLATFORMS.find((p) => p.key === key)?.label ?? "Website";
}

/** Links as entered → what's stored. One link per platform (the first); everything else goes under "other". */
export function socialsFromLinks(links: string[]): StoreSocials {
  const socials: StoreSocials = {};
  const other: string[] = [];
  for (const raw of links) {
    const url = raw.trim();
    if (!url) continue;
    const platform = detectPlatform(url);
    if (platform && platform !== "other" && !socials[platform]) socials[platform] = url;
    else if (!other.includes(url)) other.push(url);
  }
  if (other.length) socials.other = other;
  return socials;
}

/** What's stored → links to edit, known platforms first. */
export function linksFromSocials(value: unknown): string[] {
  const socials = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  const known = SOCIAL_PLATFORMS.map((p) => socials[p.key]).filter((v): v is string => typeof v === "string" && v.length > 0);
  const other = Array.isArray(socials.other) ? socials.other.filter((v): v is string => typeof v === "string") : [];
  return [...known, ...other];
}

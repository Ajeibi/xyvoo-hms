import type { ReactNode } from "react";
import { FiGlobe } from "react-icons/fi";
import type { Storefront } from "@/lib/store/site/storefront";
import { brandIconFor } from "@/lib/store/social-brand-icons";
import { detectPlatform, platformLabel, SOCIAL_PLATFORMS, type SocialPlatform } from "@/lib/store/socials";
import SocialIcon from "./SocialIcon";

/*
 * Server only (it looks logos up in the full brand icon set). Each link comes
 * with its icon already drawn, so client components such as the header can
 * show it without loading the set.
 */

export type StoreSocialLink = { href: string; label: string; platform: SocialPlatform | "other"; icon: ReactNode; iconSm: ReactNode };

const https = (href: unknown): href is string => typeof href === "string" && /^https:\/\//.test(href);

/** A logo for a site we don't draw ourselves: its brand logo, else its own icon we saved, else a globe. */
function otherIcon(href: string, iconUrl: string | undefined, size?: "sm") {
  const sizeClass = size ? ` icon--${size}` : "";
  const Brand = brandIconFor(href);
  if (Brand) return <Brand className={`icon icon--brand${sizeClass}`} aria-hidden focusable="false" />;
  if (iconUrl) {
    // eslint-disable-next-line @next/next/no-img-element -- a tiny saved favicon
    return <img className={`icon icon--favicon${sizeClass}`} src={iconUrl} alt="" width={20} height={20} loading="lazy" />;
  }
  return <FiGlobe className={`icon${sizeClass}`} aria-hidden focusable="false" />;
}

/** The merchant's social pages, https links only, when they've chosen to show them. Known platforms first. */
export function storeSocialLinks(storefront: Storefront): StoreSocialLink[] {
  if (!storefront.site.navigation.showSocialIcons) return [];
  const socials = storefront.profile.socials;
  const known = SOCIAL_PLATFORMS.flatMap((p) =>
    https(socials[p.key])
      ? [{ href: socials[p.key]!, label: p.label, platform: p.key, icon: <SocialIcon platform={p.key} />, iconSm: <SocialIcon platform={p.key} size="sm" /> }]
      : [],
  );
  const other = (socials.other ?? []).filter(https).map((href): StoreSocialLink => {
    const platform = detectPlatform(href) ?? "other";
    if (platform !== "other") {
      return { href, label: platformLabel(platform), platform, icon: <SocialIcon platform={platform} />, iconSm: <SocialIcon platform={platform} size="sm" /> };
    }
    const host = new URL(href).hostname.toLowerCase();
    const iconUrl = socials.icons?.[host];
    return { href, label: host.replace(/^www\./, ""), platform, icon: otherIcon(href, iconUrl), iconSm: otherIcon(href, iconUrl, "sm") };
  });
  return [...known, ...other];
}

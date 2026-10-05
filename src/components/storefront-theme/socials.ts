import type { Storefront } from "@/lib/store/site/storefront";
import type { IconName } from "./primitives";

const SOCIALS: Array<{ key: keyof Storefront["profile"]["socials"]; label: string; icon: IconName }> = [
  { key: "instagram", label: "Instagram", icon: "instagram" },
  { key: "facebook", label: "Facebook", icon: "facebook" },
  { key: "tiktok", label: "TikTok", icon: "tiktok" },
  { key: "youtube", label: "YouTube", icon: "youtube" },
  { key: "pinterest", label: "Pinterest", icon: "pinterest" },
];

/** The merchant's social profiles, https links only, when they've chosen to show them. */
export function storeSocialLinks(storefront: Storefront) {
  if (!storefront.site.navigation.showSocialIcons) return [];
  return SOCIALS.flatMap((s) => {
    const href = storefront.profile.socials[s.key];
    return href && /^https:\/\//.test(href) ? [{ href, label: s.label, icon: s.icon }] : [];
  });
}

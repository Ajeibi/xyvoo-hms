import { FaLinkedinIn, FaSnapchat, FaTelegram, FaThreads, FaWhatsapp, FaXTwitter } from "react-icons/fa6";
import { FiGlobe } from "react-icons/fi";
import type { SocialPlatform } from "@/lib/store/socials";
import { Icon } from "./primitives";

/** Platforms the template's icon sprite already draws; the rest come from react-icons as inline SVG. */
const SPRITE = new Set<string>(["instagram", "facebook", "pinterest", "youtube", "tiktok"]);

const BRAND = {
  x: FaXTwitter,
  linkedin: FaLinkedinIn,
  snapchat: FaSnapchat,
  threads: FaThreads,
  telegram: FaTelegram,
  whatsapp: FaWhatsapp,
} as const;

export default function SocialIcon({ platform, size }: { platform: SocialPlatform | "other"; size?: "sm" }) {
  if (SPRITE.has(platform)) return <Icon name={platform as "instagram"} size={size} />;
  const className = `icon icon--brand${size ? ` icon--${size}` : ""}`;
  if (platform === "other") return <FiGlobe className={`icon${size ? ` icon--${size}` : ""}`} aria-hidden focusable="false" />;
  const Brand = BRAND[platform as keyof typeof BRAND];
  return <Brand className={className} aria-hidden focusable="false" />;
}

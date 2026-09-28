import type { LucideIcon } from "lucide-react";

export type MarketingContactForm = {
  name: string;
  email: string;
  company: string;
  message: string;
  type: string;
  /** "Talk to Sales" only — what they're running, or "not sure yet". */
  businessType?: string;
  /** "Get Support" only — how urgent the issue is. */
  urgency?: string;
};

export type MarketingTeamAvatarProps = {
  initials: string;
  hue: number;
  size?: "lg" | "sm";
};

export type MarketingIconFeature = {
  icon: LucideIcon;
  title: string;
  desc: string;
};

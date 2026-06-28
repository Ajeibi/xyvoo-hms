import type { LucideIcon } from "lucide-react";

export type MarketingContactForm = {
  name: string;
  email: string;
  company: string;
  message: string;
  type: string;
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

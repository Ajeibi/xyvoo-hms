export type HomePricingTab = "store" | "hms";

export type HomeStorePlan = {
  name: string;
  description: string;
  priceDisplay: string;
  feeDisplay: string;
  features: string[];
  ctaLabel: string;
  ctaHref: string;
  featured?: boolean;
};

export type HomeHmsCycle = {
  id: string;
  label: string;
  badge?: string | null;
  priceDisplay: string;
  period?: string;
  feeDisplay: string;
  total?: string;
  ctaLabel: string;
  featured?: boolean;
};

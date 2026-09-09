export type HomePricingTab = "storefront" | "hms";

export type HomeStorefrontPlan = {
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

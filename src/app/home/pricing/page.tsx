"use client";

import WebsiteLayout from "@/components/website/WebsiteLayout";
import { HomePricingSection } from "@/components/website/HomePricingSection";
import { HomePricingFaqSection } from "@/components/website/HomePricingFaqSection";

export default function PricingPage() {
  return (
    <WebsiteLayout>
      <HomePricingSection standalonePage defaultTab="hms" animateHmsCycles />
      <HomePricingFaqSection />
    </WebsiteLayout>
  );
}

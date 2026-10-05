"use client";

import { HomePricingSection } from "@/components/website/HomePricingSection";
import { HomePricingFaqSection } from "@/components/website/HomePricingFaqSection";

export default function PricingPage() {
  return (
    <>
      <HomePricingSection standalonePage defaultTab="hms" animateHmsCycles />
      <HomePricingFaqSection />
    </>
  );
}

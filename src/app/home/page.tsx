"use client";

import WebsiteLayout from "@/components/website/WebsiteLayout";
import { HomeHero } from "@/components/website/HomeHero";
import { HomeFeatureMarquee } from "@/components/website/HomeFeatureMarquee";
import { HomeProductsSection } from "@/components/website/HomeProductsSection";
import { HomeStoreFeaturesSection } from "@/components/website/HomeStoreFeaturesSection";
import { HomeWhyChooseSection } from "@/components/website/HomeWhyChooseSection";
import { HomePricingSection } from "@/components/website/HomePricingSection";
import { HomePricingFaqSection } from "@/components/website/HomePricingFaqSection";

export default function WebsiteHomePage() {
  return (
    <WebsiteLayout>
      <HomeHero />
      <HomeFeatureMarquee />

      <HomeProductsSection />

      <HomeWhyChooseSection />
      <HomeStoreFeaturesSection />
      <HomePricingSection />
      <HomePricingFaqSection />

    </WebsiteLayout>
  );
}

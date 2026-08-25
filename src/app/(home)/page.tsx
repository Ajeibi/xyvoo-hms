"use client";

import WebsiteLayout from "@/components/website/WebsiteLayout";
import { HomeHero } from "@/components/website/HomeHero";
import { HomeAbout } from "@/components/website/HomeAbout";
import { HomeFeatureMarquee } from "@/components/website/HomeFeatureMarquee";
import { HomeWhyXyvooSection } from "@/components/website/HomeWhyXyvooSection";
import { HomePricingSection } from "@/components/website/HomePricingSection";
import { HomePricingFaqSection } from "@/components/website/HomePricingFaqSection";

export default function WebsiteHomePage() {
  return (
    <WebsiteLayout>
      <HomeHero />
      <HomeFeatureMarquee />
      <HomeAbout />
      <HomeWhyXyvooSection />
      <HomePricingSection />
      <HomePricingFaqSection />
    </WebsiteLayout>
  );
}

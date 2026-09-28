"use client";

import type { CSSProperties } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowUpRight } from "lucide-react";
import { HomePricingSection } from "@/components/website/HomePricingSection";
import { SolutionAtAGlance } from "@/components/website/SolutionAtAGlance";
import { SolutionGrowthStack } from "@/components/website/SolutionGrowthStack";
import { SolutionIntegrationsList } from "@/components/website/SolutionIntegrationsList";
import { SolutionsOnboardingStack } from "@/components/website/SolutionsOnboardingStack";
import { StorefrontFeatureShelf } from "@/components/website/StorefrontFeatureShelf";
import { StorefrontHighlightTicker } from "@/components/website/StorefrontHighlightTicker";
import { StorefrontOrderFlow } from "@/components/website/StorefrontOrderFlow";
import { storefrontSiblingLinks, type StorefrontExtraPage } from "@/constants/solutions-storefront-extras";

/** Storefront's brand teal, as an rgb triple for use in rgb(... / alpha). */
const STOREFRONT_ACCENT_RGB = "77 208 196";

/** Grid backdrop — transparent white grid lines for dark background, matching /solution/storefront */
const DARK_GRID_STYLE: CSSProperties = {
  backgroundImage: `
      linear-gradient(to right, rgba(255, 255, 255, 0.015) 1px, transparent 1px),
      linear-gradient(to bottom, rgba(255, 255, 255, 0.015) 1px, transparent 1px)
    `,
  backgroundSize: "40px 40px",
};

export function StorefrontExtraLanding({ page }: { page: StorefrontExtraPage }) {
  const siblings = storefrontSiblingLinks(page.id);

  const atAGlance = (
    <SolutionAtAGlance
      accentRgb={STOREFRONT_ACCENT_RGB}
      stats={[
        { label: "Part Of", value: "XYVOO Storefront" },
        { label: "Built For", value: "Online retailers & merchants" },
        { label: "Available On", value: "Free plan and up" },
      ]}
      tagsLabel="Includes"
      tags={page.features.map((f) => f.number.split("—")[1]?.trim() ?? f.number)}
    />
  );

  // Fine-print overview of the feature set — plain, scannable, sticky-left/scrolling-right, kept deliberately simple since this list is the important part.
  const finePrint = (
    <SolutionIntegrationsList
      headingId={`${page.id}-features-heading`}
      title={page.growth.title}
      intro={page.growth.subtitle}
      items={page.features.map((f) => ({
        title: f.number.split("—")[1]?.trim() ?? f.number,
        description: f.description,
      }))}
      accentRgb={STOREFRONT_ACCENT_RGB}
    />
  );

  const onboarding = (
    <SolutionsOnboardingStack
      heading={page.onboarding.heading}
      cards={page.onboarding.cards}
      accentColor="rgb(39, 201, 63)"
      accentRgb="39, 201, 63"
    />
  );

  // Colors omitted — the default CSS module palette already matches Storefront's own teal/dark-green look. Driven by integrations, not features, so this doesn't repeat the fine-print list above.
  const growthStack = (
    <SolutionGrowthStack
      modules={page.integrations.items.map((item, i) => ({
        id: item.title.toLowerCase().replace(/\s+/g, "-"),
        number: `${String(i + 1).padStart(2, "0")} — ${item.title}`,
        title: item.title,
        description: item.description,
      }))}
      heading={{
        eyebrow: page.growth.eyebrow,
        title: page.integrations.title,
        subtitle: page.integrations.intro,
      }}
      tagline={page.growth.tagline}
    />
  );

  const pricing = <HomePricingSection defaultTab="storefront" />;

  // Storefront-specific alternatives to finePrint/onboarding/growthStack —
  // deliberately NOT the same components HMS uses (just recoloured), so the
  // two products read as genuinely different designs. Used only for
  // "compact"/"rich" business-type pages; the three original feature
  // sub-pages keep the components above, untouched.
  const featureShelf = (
    <StorefrontFeatureShelf
      headingId={`${page.id}-features-heading`}
      eyebrow={page.growth.eyebrow}
      title={page.growth.title}
      intro={page.growth.subtitle}
      items={page.features.map((f) => ({
        title: f.number.split("—")[1]?.trim() ?? f.number,
        description: f.description,
      }))}
      accentRgb={STOREFRONT_ACCENT_RGB}
    />
  );

  const orderFlow = (
    <StorefrontOrderFlow
      headingId={`${page.id}-onboarding-heading`}
      heading={page.onboarding.heading}
      steps={page.onboarding.cards}
      accentRgb={STOREFRONT_ACCENT_RGB}
    />
  );

  const highlightTicker = page.stats ? (
    <StorefrontHighlightTicker
      eyebrow={page.integrations.title}
      title={page.integrations.intro}
      items={page.stats}
      accentRgb={STOREFRONT_ACCENT_RGB}
    />
  ) : null;

  return (
    <>
      {/* Hero — dense split layout, same bg as /solution/storefront's own hero */}
      <section className="relative isolate overflow-hidden border-b border-white/5 bg-[#04140f] px-6 pt-36 pb-20 md:pb-24">
        <div className="pointer-events-none absolute inset-0 z-0" style={DARK_GRID_STYLE} aria-hidden />
        <div
          className="pointer-events-none absolute -top-16 right-[8%] z-0 h-[360px] w-[360px] rounded-full blur-[100px]"
          style={{ background: "rgb(var(--xyvoo-teal-product-rgb, 77 208 196) / 0.24)" }}
          aria-hidden
        />

        <div className="relative z-10 mx-auto grid max-w-[1200px] grid-cols-1 gap-14 lg:grid-cols-[1.15fr_0.85fr] lg:items-center">
          <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.55, ease: "easeOut" }}>
            <p className="mb-5 text-eyebrow font-bold uppercase tracking-[0.22em]" style={{ color: "var(--xyvoo-teal-product)" }}>
              {page.eyebrow}
            </p>
            <h1 className="text-balance text-h1 font-black leading-[1.08] tracking-tight text-white">
              {page.title}
            </h1>
            <p className="mt-6 max-w-md text-p leading-relaxed text-white/60">
              {page.subtitle}
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.1, ease: "easeOut" }}
            className="border-t border-white/10"
          >
            {siblings.map((link) => (
              <Link key={link.id} href={link.href} className="group block border-b border-white/10 py-7 first:pt-0">
                <div className="flex items-baseline justify-between gap-4">
                  <h3 className="text-lg font-bold text-white">{link.title}</h3>
                  <span
                    className="inline-flex shrink-0 items-center gap-1 text-xs font-bold uppercase tracking-wider transition-colors group-hover:text-white"
                    style={{ color: "var(--xyvoo-teal-product)" }}
                  >
                    Explore
                    <ArrowUpRight className="h-3 w-3" />
                  </span>
                </div>
                <p className="mt-2 max-w-sm text-sm leading-relaxed text-white/50">{link.description}</p>
              </Link>
            ))}
          </motion.div>
        </div>
      </section>

      {atAGlance}

      {page.layout === "compact" ? (
        <>
          {featureShelf}
          {orderFlow}
        </>
      ) : page.layout === "rich" ? (
        <>
          {highlightTicker}
          {featureShelf}
          {orderFlow}
        </>
      ) : (
        <>
          {finePrint}
          {onboarding}
          {growthStack}
        </>
      )}

      {pricing}
    </>
  );
}

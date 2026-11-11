"use client";

import type { CSSProperties } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowUpRight } from "lucide-react";
import { HeroWatermark } from "@/components/website/HeroWatermark";
import { HomePricingSection } from "@/components/website/HomePricingSection";
import { SolutionAtAGlance } from "@/components/website/SolutionAtAGlance";
import { SolutionFeatureGroups } from "@/components/website/SolutionFeatureGroups";
import { SolutionFeatureShowcase } from "@/components/website/SolutionFeatureShowcase";
import { SolutionGrowthStack, type SolutionGrowthStackColors } from "@/components/website/SolutionGrowthStack";
import { SolutionIntegrationsList } from "@/components/website/SolutionIntegrationsList";
import { SolutionStatBand } from "@/components/website/SolutionStatBand";
import { SolutionStepReel } from "@/components/website/SolutionStepReel";
import { SolutionsOnboardingStack } from "@/components/website/SolutionsOnboardingStack";
import { hmsSiblingLinks, type HmsExtraPage } from "@/constants/solutions-hms-extras";

/** HMS's brand blue, as an rgb triple for use in rgb(... / alpha). */
const HMS_ACCENT_RGB = "0 126 223";

/** Same shape of palette as Storefront's growth stack (dark navy instead of
 * dark green, blue instead of teal) — --teal-rgb specifically needs commas
 * (it feeds `rgba(var(--teal-rgb), alpha)` inside the CSS module), unlike
 * the space-separated convention used everywhere else on this page. */
const HMS_GROWTH_COLORS: SolutionGrowthStackColors = {
  voidBg: "#000d1f",
  panelBg: "#0b1c33",
  ink: "#eef3fa",
  inkDim: "rgba(238, 243, 250, 0.62)",
  inkFaint: "rgba(238, 243, 250, 0.4)",
  line: "rgba(238, 243, 250, 0.12)",
  accent: "#3b9cf6",
  accentRgb: "0, 126, 223",
};

/** Grid backdrop — transparent white grid lines for dark background, matching /solution/hms */
const DARK_GRID_STYLE: CSSProperties = {
  backgroundImage: `
      linear-gradient(to right, rgba(255, 255, 255, 0.015) 1px, transparent 1px),
      linear-gradient(to bottom, rgba(255, 255, 255, 0.015) 1px, transparent 1px)
    `,
  backgroundSize: "40px 40px",
};

/** One lowercase word per page for the hero watermark. */
const HMS_WATERMARKS: Record<string, string> = {
  "guest-experience": "guests",
  operations: "behind",
  "finance-analytics": "numbers",
  "independent-hotels": "inn",
  "hotel-groups": "groups",
};

export function HmsExtraLanding({ page }: { page: HmsExtraPage }) {
  const siblings: { id: string; title: string; description: string; href: string; label?: string }[] =
    page.heroLinks ?? hmsSiblingLinks(page.id);

  const atAGlance = (
    <SolutionAtAGlance
      accentRgb={HMS_ACCENT_RGB}
      stats={
        page.glance?.stats ?? [
          { label: "Part Of", value: "XYVOO HMS" },
          { label: "Built For", value: "Hotels & properties" },
          { label: "Live In", value: "<60s provisioning" },
        ]
      }
      tagsLabel={page.glance?.tagsLabel ?? "Includes"}
      tags={page.features.map((f) => f.number.replace(/^\d+\s*(?:—|–|\.|:)\s*/, "").trim())}
    />
  );

  // Fine-print overview of the feature set — plain, scannable, sticky-left/scrolling-right, kept deliberately simple since this list is the important part.
  const finePrint = (
    <SolutionIntegrationsList
      headingId={`${page.id}-features-heading`}
      title={page.growth.title}
      intro={page.growth.subtitle}
      items={page.features.map((f) => ({
        title: f.number.replace(/^\d+\s*(?:—|–|\.|:)\s*/, "").trim(),
        description: f.description,
      }))}
      accentRgb={HMS_ACCENT_RGB}
    />
  );

  const onboarding = (
    <SolutionsOnboardingStack
      heading={page.onboarding.heading}
      cards={page.onboarding.cards}
      accentColor="rgb(0, 126, 223)"
      accentRgb="0, 126, 223"
    />
  );

  // Driven by integrations, not features, so this doesn't repeat the fine-print list above.
  const growthStack = (
    <SolutionGrowthStack
      modules={page.integrations.items.map((item, i) => ({
        id: item.title.toLowerCase().replace(/\s+/g, "-"),
        number: `${String(i + 1).padStart(2, "0")}. ${item.title}`,
        title: item.title,
        description: item.description,
      }))}
      heading={{
        eyebrow: page.growth.eyebrow,
        title: page.integrations.title,
        subtitle: page.integrations.intro,
      }}
      tagline={page.growth.tagline}
      colors={HMS_GROWTH_COLORS}
    />
  );

  const pricing = <HomePricingSection defaultTab="hms" />;

  // Fresh alternatives to finePrint/onboarding/growthStack, used only for
  // "compact"/"rich" business-type pages — the three original feature
  // sub-pages keep the components above, untouched.
  const featureShowcase = (
    <SolutionFeatureShowcase
      headingId={`${page.id}-features-heading`}
      eyebrow={page.growth.eyebrow}
      title={page.growth.title}
      intro={page.growth.subtitle}
      items={page.features.map((f) => ({
        title: f.number.replace(/^\d+\s*(?:—|–|\.|:)\s*/, "").trim(),
        description: f.description,
      }))}
      accentRgb={HMS_ACCENT_RGB}
    />
  );

  const featureGroups = page.featureGroups ? (
    <SolutionFeatureGroups
      headingId={`${page.id}-features-heading`}
      accentRgb={HMS_ACCENT_RGB}
      groups={page.featureGroups.map((g) => ({
        eyebrow: g.eyebrow,
        title: g.title,
        intro: g.intro,
        image: g.image,
        items: g.featureIds.map((id) => {
          const f = page.features.find((x) => x.id === id);
          if (!f) throw new Error(`Unknown feature id in group: ${id}`);
          return {
            title: f.number.replace(/^\d+\s*(?:—|–|\.|:)\s*/, "").trim(),
            description: f.description,
          };
        }),
      }))}
    />
  ) : null;

  // Pages with no onboarding steps (e.g. /white-labeling) skip the reel.
  const stepReel = page.onboarding.cards.length === 0 ? null : (
    <SolutionStepReel
      headingId={`${page.id}-onboarding-heading`}
      heading={page.onboarding.heading}
      steps={page.onboarding.cards}
      accentRgb={HMS_ACCENT_RGB}
      image={page.onboarding.image}
    />
  );

  const statBand = page.stats ? (
    <SolutionStatBand
      eyebrow={page.integrations.title}
      title={page.integrations.intro}
      items={page.stats}
      bgColor="#000d1f"
      accentRgb={HMS_ACCENT_RGB}
    />
  ) : null;

  return (
    <>
      {/* Hero — dense split layout, same bg as /solution/hms's own hero */}
      <section className="relative isolate overflow-hidden border-b border-white/5 bg-[#000d1f] px-6 pt-36 pb-20 md:px-12 md:pb-24 lg:px-6">
        <div className="pointer-events-none absolute inset-0 z-0" style={DARK_GRID_STYLE} aria-hidden />
        <HeroWatermark text={page.watermark ?? HMS_WATERMARKS[page.id] ?? "hotels"} tone="dark" />
        <div
          className="pointer-events-none absolute -top-16 right-[8%] z-0 h-[360px] w-[360px] rounded-full blur-[100px]"
          style={{ background: "rgb(var(--xyvoo-blue-rgb) / 0.24)" }}
          aria-hidden
        />

        <div className="relative z-10 mx-auto grid max-w-[1200px] grid-cols-1 gap-14 lg:grid-cols-[1.15fr_0.85fr] lg:items-center">
          <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.55, ease: "easeOut" }}>
            <p className="mb-5 text-eyebrow font-bold uppercase tracking-[0.22em] text-[#90caf9]">
              {page.eyebrow}
            </p>
            <h1 className="text-balance text-h1 font-black leading-[1.08] tracking-tight text-white">
              {page.title}
            </h1>
            <p className="mt-6 md:max-w-none lg:max-w-md text-p leading-relaxed text-white/60">
              {page.subtitle}
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.1, ease: "easeOut" }}
            className="border-t border-white/10"
          >
            {siblings.slice(0, 3).map((link) => (
              <Link key={link.id} href={link.href} className="group block border-b border-white/10 py-7 first:pt-0">
                <div className="flex items-baseline justify-between gap-4">
                  <h3 className="text-lg font-bold text-white">{link.title}</h3>
                  <span className="inline-flex shrink-0 items-center gap-1 text-xs font-bold uppercase tracking-wider text-[#90caf9] transition-colors group-hover:text-white">
                    {link.label ?? "Explore"}
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
          {featureGroups ?? featureShowcase}
          {stepReel}
        </>
      ) : page.layout === "rich" ? (
        <>
          {statBand}
          {featureGroups ?? featureShowcase}
          {stepReel}
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

"use client";

import { useRef } from "react";
import Link from "next/link";
import { motion, useInView } from "framer-motion";
import {
  ArrowRight,
  BarChart2,
  CreditCard,
  Megaphone,
  Package,
  Store,
  Truck,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import {
  SOLUTIONS_STOREFRONT_INTEGRATIONS_INTRO,
  SOLUTIONS_STOREFRONT_INTEGRATIONS_ITEMS,
  SOLUTIONS_STOREFRONT_INTEGRATIONS_TITLE,
  SOLUTIONS_STOREFRONT_ONBOARDING_CARDS,
  SOLUTIONS_STOREFRONT_STACK_MODULES,
  type SolutionsStorefrontStackModule,
} from "@/constants/solutions-storefront";
import type { FadeInSectionProps } from "@/types";
import { StorefrontGrowthStack } from "@/components/website/StorefrontGrowthStack";
import { SolutionsOnboardingStack } from "@/components/website/SolutionsOnboardingStack";

/** First 4 modules keep the full-width sticky-stack treatment; the
 * remaining 3 (marketing, team, analytics) run as a single arc-cycle card
 * stack instead — see StorefrontGrowthStack. */
const STICKY_STACK_COUNT = 4;

const STACK_ICON_BY_ID: Record<string, LucideIcon> = {
  storefront: Store,
  catalog: Package,
  orders: Truck,
  payments: CreditCard,
  marketing: Megaphone,
  team: UsersRound,
  analytics: BarChart2,
};

function FadeIn({ children, delay = 0 }: FadeInSectionProps) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-50px" });
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 32 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.65, delay, ease: "easeOut" }}
    >
      {children}
    </motion.div>
  );
}

function ModuleStackCard({
  module,
  reverse,
  rowIndex,
}: {
  module: SolutionsStorefrontStackModule;
  reverse: boolean;
  rowIndex: number;
}) {
  const Icon = STACK_ICON_BY_ID[module.id] ?? BarChart2;
  const rowToken = (rowIndex % 4) + 1;
  const phVar =
    rowToken === 1
      ? "var(--xyvoo-storefront-deepdive-ph-1)"
      : rowToken === 2
        ? "var(--xyvoo-storefront-deepdive-ph-2)"
        : rowToken === 3
          ? "var(--xyvoo-storefront-deepdive-ph-3)"
          : "var(--xyvoo-storefront-deepdive-ph-4)";
  const rowBg =
    rowToken === 1
      ? "var(--xyvoo-storefront-deepdive-row-1)"
      : rowToken === 2
        ? "var(--xyvoo-storefront-deepdive-row-2)"
        : rowToken === 3
          ? "var(--xyvoo-storefront-deepdive-row-3)"
          : "var(--xyvoo-storefront-deepdive-row-4)";

  return (
    <div
      className={`grid min-h-[480px] grid-cols-1 items-center overflow-hidden rounded-[20px] border md:min-h-[520px] md:grid-cols-2 ${
        reverse ? "md:[&>*:first-child]:order-2" : ""
      }`}
      style={{
        background: rowBg,
        borderColor: "var(--xyvoo-storefront-deepdive-row-border)",
        boxShadow:
          "var(--xyvoo-storefront-deepdive-row-shadow-lg), var(--xyvoo-storefront-deepdive-row-shadow-sm)",
      }}
    >
      <div className="flex flex-col px-5 pb-5 pt-9 sm:px-8 sm:pb-6 sm:pt-11 md:px-[72px] md:pb-[72px] md:pt-[72px]">
        <div
          className="mb-3 text-[11px] font-bold uppercase tracking-[0.16em]"
          style={{ color: "var(--xyvoo-storefront-deepdive-number)" }}
        >
          {module.number}
        </div>
        <h3
          className="mb-3 whitespace-pre-line font-extrabold leading-[1.18] text-[clamp(1.55rem,3vw,1.9rem)]"
          style={{ color: "var(--xyvoo-storefront-deepdive-title)" }}
        >
          {module.title}
        </h3>
        <p
          className="mb-6 max-w-[400px] text-[15.5px] leading-[1.75]"
          style={{ color: "var(--xyvoo-storefront-deepdive-desc)" }}
        >
          {module.description}
        </p>
        <div className="mb-8 flex flex-col gap-[10px]">
          {module.bullets.map((bullet) => (
            <div
              key={bullet}
              className="flex items-start gap-[11px] text-[13.5px] leading-[1.5]"
              style={{ color: "var(--xyvoo-storefront-deepdive-bullet)" }}
            >
              <span
                className="mt-[5px] h-[6px] w-[6px] shrink-0 rounded-full"
                style={{ background: "var(--xyvoo-teal-product)" }}
              />
              <span>{bullet}</span>
            </div>
          ))}
        </div>
        <Link
          href="/register"
          className="inline-flex items-center gap-2 text-sm font-semibold"
          style={{ color: "var(--xyvoo-storefront-deepdive-secondary-text)" }}
        >
          Get started
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>

      <div className="relative flex items-center justify-center px-5 pb-9 pt-3 sm:px-8 sm:pb-11 md:px-[36px] md:py-12">
        <div
          className="pointer-events-none absolute left-1/2 top-1/2 z-0 h-[260px] w-[260px] -translate-x-1/2 -translate-y-1/2 rounded-full blur-[52px]"
          style={{ background: "var(--xyvoo-storefront-deepdive-glow-a)" }}
        />
        <div
          className="pointer-events-none absolute bottom-4 right-4 z-0 h-[150px] w-[150px] rounded-full blur-[32px]"
          style={{ background: "var(--xyvoo-storefront-deepdive-glow-b)" }}
        />
        <div
          className="relative z-[1] w-full overflow-hidden rounded-[14px] border"
          style={{
            background: "var(--xyvoo-storefront-deepdive-visual-card-bg)",
            borderColor: "var(--xyvoo-storefront-deepdive-visual-card-border)",
            boxShadow:
              "var(--xyvoo-storefront-deepdive-visual-card-shadow-a), var(--xyvoo-storefront-deepdive-visual-card-shadow-b)",
          }}
        >
          <div
            className="flex items-center gap-1.5 border-b px-3.5 py-2.5"
            style={{
              background: "var(--xyvoo-storefront-deepdive-chrome-bg)",
              borderColor: "var(--xyvoo-storefront-deepdive-chrome-border)",
            }}
          >
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ background: "var(--xyvoo-storefront-deepdive-dot-red)" }}
            />
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ background: "var(--xyvoo-storefront-deepdive-dot-yellow)" }}
            />
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ background: "var(--xyvoo-storefront-deepdive-dot-green)" }}
            />
            <div
              className="mx-2 flex h-[22px] flex-1 items-center gap-1.5 rounded-[5px] border px-2.5"
              style={{
                borderColor: "var(--xyvoo-storefront-deepdive-chrome-url-border)",
              }}
            >
              <span
                className="h-[9px] w-[8px] rounded-[2px] border-[1.5px]"
                style={{ borderColor: "var(--xyvoo-storefront-deepdive-lock)" }}
              />
              <span
                className="text-[10px]"
                style={{ color: "var(--xyvoo-storefront-deepdive-chrome-url-text)" }}
              >
                {module.urlLabel}
              </span>
            </div>
          </div>

          <div
            className="relative flex aspect-[16/10] w-full flex-col items-center justify-center gap-3 overflow-hidden"
            style={{ background: phVar }}
          >
            <div
              className="pointer-events-none absolute inset-0"
              style={{
                backgroundImage:
                  "radial-gradient(circle, var(--xyvoo-storefront-deepdive-ph-dot) 1px, transparent 1px)",
                backgroundSize: "22px 22px",
              }}
            />
            <div
              className="relative z-[1] flex h-[52px] w-[52px] items-center justify-center rounded-[14px] border"
              style={{
                background: "var(--xyvoo-white)",
                borderColor: "var(--xyvoo-storefront-deepdive-ph-icon-border)",
              }}
            >
              <Icon className="h-[22px] w-[22px] text-xyvoo-blue" aria-hidden />
            </div>
            <span
              className="relative z-[1] text-center text-xs leading-[1.55]"
              style={{ color: "var(--xyvoo-storefront-deepdive-ph-label)" }}
            >
              {module.title.replace("\n", " ")}
              <br />
              module preview
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Sticky-stack row: plain position:sticky + increasing z-index, so each row
 * covers the previous one as it scrolls up. */
function StackRow({
  zIndex,
  children,
}: {
  zIndex: number;
  children: React.ReactNode;
}) {
  return (
    <div className="relative md:sticky md:top-24" style={{ zIndex }}>
      {children}
    </div>
  );
}

export function SolutionsStorefrontDeepDive() {
  return (
    <>
      <section
        className="px-3 pb-4 md:px-6 md:pb-[60px]"
        style={{ background: "var(--xyvoo-storefront-deepdive-bg)" }}
        aria-label="XYVOO Storefront module overview"
      >
        <div className="mx-auto max-w-[1200px]">
          <FadeIn>
            <div className="px-5 pb-11 pt-11 text-center md:px-8 md:pb-[72px] md:pt-[72px]">
              <h2
                className="mb-4 text-balance text-[clamp(1.625rem,4.4vw,2.75rem)] font-extrabold leading-[1.12]"
                style={{ color: "var(--xyvoo-navy)" }}
              >
                Every part of your shop,
                <br />
                one operating model.
              </h2>
            </div>
          </FadeIn>

          <div className="flex flex-col gap-6">
            {SOLUTIONS_STOREFRONT_STACK_MODULES.slice(0, STICKY_STACK_COUNT).map((module, rowPos) => (
              <StackRow key={module.id} zIndex={rowPos + 1}>
                <ModuleStackCard
                  module={module}
                  reverse={rowPos % 2 === 1}
                  rowIndex={rowPos}
                />
              </StackRow>
            ))}
          </div>
        </div>
      </section>

      <StorefrontGrowthStack modules={SOLUTIONS_STOREFRONT_STACK_MODULES.slice(STICKY_STACK_COUNT)} />

      {/* Getting started — plain heading on the left, a scroll-morphing
          deck of cards on the right. Storefront's brand green. */}
      <SolutionsOnboardingStack
        heading="New sellers deserve a better start."
        cards={SOLUTIONS_STOREFRONT_ONBOARDING_CARDS}
        accentColor="rgb(39, 201, 63)"
        accentRgb="39, 201, 63"
      />

      {/* Integrations — sticky title/intro on the left, a numbered list on
          the right that scrolls past it; each row's number + heading pick
          up the brand green on hover (the aienai.co "How We Work" pattern). */}
      <section
        className="border-t border-slate-100 bg-white px-6 py-16 md:py-24"
        aria-labelledby="storefront-integrations-heading"
      >
        <div className="mx-auto grid max-w-[1200px] grid-cols-1 gap-12 lg:grid-cols-2 lg:gap-16 lg:items-start">
          {/* The sticky element itself must have no animated ancestor: a
              Framer Motion wrapper leaves a non-"none" transform in place
              even at rest, and any transform on an ancestor gives
              `position: sticky` a new (non-viewport) containing block,
              which silently stops it from sticking at all. FadeIn goes
              inside the sticky box instead, where it's safe. */}
          <div className="lg:sticky lg:top-28">
            <FadeIn>
              <div>
                <h2
                  id="storefront-integrations-heading"
                  className="mb-3 text-2xl font-extrabold text-[var(--xyvoo-products-navy-alt)] md:text-[1.65rem]"
                >
                  {SOLUTIONS_STOREFRONT_INTEGRATIONS_TITLE}
                </h2>
                <p
                  className="max-w-[36ch] text-[15px] leading-relaxed"
                  style={{ color: "var(--xyvoo-navy-muted-text)" }}
                >
                  {SOLUTIONS_STOREFRONT_INTEGRATIONS_INTRO}
                </p>
              </div>
            </FadeIn>
          </div>

          <ul className="flex flex-col">
            {SOLUTIONS_STOREFRONT_INTEGRATIONS_ITEMS.map((item, i) => (
              <li
                key={item.title}
                className="group border-t border-slate-100 py-8 first:border-t-0 last:pb-0 lg:py-10 lg:last:pb-0"
              >
                <span
                  className="mb-2 block font-mono text-sm font-semibold tracking-wide text-[rgb(var(--xyvoo-navy-rgb)/0.32)] transition-colors duration-300 group-hover:text-[rgb(39_201_63)]"
                >
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span
                  className="block text-[19px] font-semibold leading-snug text-[var(--xyvoo-products-navy-alt)] transition-colors duration-300 group-hover:text-[rgb(39_201_63)] md:text-[21px]"
                >
                  {item.title}
                </span>
                <p
                  className="mt-2 max-w-[46ch] text-[15px] leading-relaxed"
                  style={{ color: "var(--xyvoo-navy-muted-text)" }}
                >
                  {item.description}
                </p>
              </li>
            ))}
          </ul>
        </div>
      </section>

    </>
  );
}

"use client";

import { useRef } from "react";
import Link from "next/link";
import { motion, useInView } from "framer-motion";
import {
  ArrowRight,
  BarChart2,
  BedDouble,
  CalendarRange,
  Check,
  ClipboardList,
  Package,
  Receipt,
  UserCheck,
  UsersRound,
  UtensilsCrossed,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import {
  SOLUTIONS_HOTEL_INTEGRATIONS_INTRO,
  SOLUTIONS_HOTEL_INTEGRATIONS_ITEMS,
  SOLUTIONS_HOTEL_INTEGRATIONS_TITLE,
  SOLUTIONS_HOTEL_ONBOARDING_ITEMS,
  SOLUTIONS_HOTEL_ONBOARDING_TITLE,
  SOLUTIONS_HOTEL_PLATFORM_ITEMS,
  SOLUTIONS_HOTEL_PLATFORM_SUBTITLE,
  SOLUTIONS_HOTEL_PLATFORM_TITLE,
  SOLUTIONS_HOTEL_STACK_MODULES,
  type SolutionsHotelStackModule,
} from "@/constants/solutions-hotel";
import { SectionEyebrow } from "@/components/website/SectionEyebrow";
import type { FadeInSectionProps } from "@/types";

const STACK_ICON_BY_ID: Record<string, LucideIcon> = {
  pms: BedDouble,
  crs: CalendarRange,
  "front-office": UserCheck,
  housekeeping: ClipboardList,
  "fb-pos": UtensilsCrossed,
  billing: Receipt,
  cmms: Wrench,
  procurement: Package,
  hr: UsersRound,
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
  module: SolutionsHotelStackModule;
  reverse: boolean;
  rowIndex: number;
}) {
  const Icon =
    STACK_ICON_BY_ID[module.id] ?? BarChart2;
  const rowToken = (rowIndex % 4) + 1;
  const phVar =
    rowToken === 1
      ? "var(--xyvoo-hms-features-ph-1)"
      : rowToken === 2
        ? "var(--xyvoo-hms-features-ph-2)"
        : rowToken === 3
          ? "var(--xyvoo-hms-features-ph-3)"
          : "var(--xyvoo-hms-features-ph-4)";

  return (
    <div
      className={`grid min-h-[480px] grid-cols-1 items-center overflow-hidden rounded-[20px] border md:min-h-[520px] md:grid-cols-2 ${
        reverse ? "md:[&>*:first-child]:order-2" : ""
      }`}
      style={{
        background: `var(--xyvoo-hms-features-row-${rowToken})`,
        borderColor: "var(--xyvoo-hms-features-row-border)",
        boxShadow:
          "var(--xyvoo-hms-features-row-shadow-lg), var(--xyvoo-hms-features-row-shadow-sm)",
      }}
    >
      <div className="flex flex-col px-5 pb-5 pt-9 sm:px-8 sm:pb-6 sm:pt-11 md:px-[72px] md:pb-[72px] md:pt-[72px]">
        <div
          className="mb-3 text-[11px] font-bold uppercase tracking-[0.16em]"
          style={{ color: "var(--xyvoo-hms-features-number)" }}
        >
          {module.number}
        </div>
        <h3
          className="mb-3 whitespace-pre-line font-extrabold leading-[1.18] text-[clamp(1.55rem,3vw,1.9rem)]"
          style={{ color: "var(--xyvoo-hms-features-title)" }}
        >
          {module.title}
        </h3>
        <p
          className="mb-6 max-w-[400px] text-[15.5px] leading-[1.75]"
          style={{ color: "var(--xyvoo-hms-features-desc)" }}
        >
          {module.description}
        </p>
        <div className="mb-8 flex flex-col gap-[10px]">
          {module.bullets.map((bullet) => (
            <div
              key={bullet}
              className="flex items-start gap-[11px] text-[13.5px] leading-[1.5]"
              style={{ color: "var(--xyvoo-hms-features-bullet)" }}
            >
              <span
                className="mt-[5px] h-[6px] w-[6px] shrink-0 rounded-full"
                style={{ background: "var(--xyvoo-blue)" }}
              />
              <span>{bullet}</span>
            </div>
          ))}
        </div>
        <Link
          href="/register"
          className="inline-flex items-center gap-2 text-sm font-semibold"
          style={{ color: "var(--xyvoo-hms-features-secondary-text)" }}
        >
          Get started
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>

      <div className="relative flex items-center justify-center px-5 pb-9 pt-3 sm:px-8 sm:pb-11 md:px-[36px] md:py-12">
        <div
          className="pointer-events-none absolute left-1/2 top-1/2 z-0 h-[260px] w-[260px] -translate-x-1/2 -translate-y-1/2 rounded-full blur-[52px]"
          style={{ background: "var(--xyvoo-hms-features-glow-a)" }}
        />
        <div
          className="pointer-events-none absolute bottom-4 right-4 z-0 h-[150px] w-[150px] rounded-full blur-[32px]"
          style={{ background: "var(--xyvoo-hms-features-glow-b)" }}
        />
        <div
          className="relative z-[1] w-full overflow-hidden rounded-[14px] border"
          style={{
            background: "var(--xyvoo-hms-features-visual-card-bg)",
            borderColor: "var(--xyvoo-hms-features-visual-card-border)",
            boxShadow:
              "var(--xyvoo-hms-features-visual-card-shadow-a), var(--xyvoo-hms-features-visual-card-shadow-b)",
          }}
        >
          <div
            className="flex items-center gap-1.5 border-b px-3.5 py-2.5"
            style={{
              background: "var(--xyvoo-hms-features-chrome-bg)",
              borderColor: "var(--xyvoo-hms-features-chrome-border)",
            }}
          >
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ background: "var(--xyvoo-hms-features-dot-red)" }}
            />
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ background: "var(--xyvoo-hms-features-dot-yellow)" }}
            />
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ background: "var(--xyvoo-hms-features-dot-green)" }}
            />
            <div
              className="mx-2 flex h-[22px] flex-1 items-center gap-1.5 rounded-[5px] border px-2.5"
              style={{
                borderColor: "var(--xyvoo-hms-features-chrome-url-border)",
              }}
            >
              <span
                className="h-[9px] w-[8px] rounded-[2px] border-[1.5px]"
                style={{ borderColor: "var(--xyvoo-hms-features-lock)" }}
              />
              <span
                className="text-[10px]"
                style={{ color: "var(--xyvoo-hms-features-chrome-url-text)" }}
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
                  "radial-gradient(circle, var(--xyvoo-hms-features-ph-dot) 1px, transparent 1px)",
                backgroundSize: "22px 22px",
              }}
            />
            <div
              className="relative z-[1] flex h-[52px] w-[52px] items-center justify-center rounded-[14px] border"
              style={{
                background: "var(--xyvoo-white)",
                borderColor: "var(--xyvoo-hms-features-ph-icon-border)",
              }}
            >
              <Icon className="h-[22px] w-[22px] text-xyvoo-blue" aria-hidden />
            </div>
            <span
              className="relative z-[1] text-center text-xs leading-[1.55]"
              style={{ color: "var(--xyvoo-hms-features-ph-label)" }}
            >
              {module.title.replace("\n", " ")}
              <br />
              module preview
            </span>
            <span
              className="absolute bottom-3.5 right-3.5 z-[2] rounded-full px-2.5 py-1 text-[10.5px] font-semibold uppercase tracking-[0.05em]"
              style={{
                background: "var(--xyvoo-hms-features-badge-bg)",
                color: "var(--xyvoo-hms-features-badge-text)",
              }}
            >
              {module.badge}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export function SolutionsHotelDeepDive() {
  return (
    <>
      {/* Platform — 1 col mobile, 2 col lg */}
      <section
        className="border-b border-slate-100 bg-white px-6 py-16 md:py-24"
        aria-labelledby="hotel-platform-heading"
      >
        <div className="mx-auto max-w-[1200px]">
          <FadeIn>
            <SectionEyebrow
              eyebrow="V1 capabilities"
              title={SOLUTIONS_HOTEL_PLATFORM_TITLE}
              titleId="hotel-platform-heading"
              className="[&>h2]:[color:var(--xyvoo-products-navy-alt)] [&>p]:[color:var(--xyvoo-blue)]"
            />
            <p
              className="mx-auto mt-4 max-w-2xl text-center text-[17px] leading-relaxed md:mx-0 md:text-left"
              style={{ color: "var(--xyvoo-navy-muted-text)" }}
            >
              {SOLUTIONS_HOTEL_PLATFORM_SUBTITLE}
            </p>
          </FadeIn>
          <FadeIn delay={0.08}>
            <ul className="mt-12 grid grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-5">
              {SOLUTIONS_HOTEL_PLATFORM_ITEMS.map((item) => (
                <li
                  key={item}
                  className="flex gap-3 rounded-2xl border bg-white p-5 md:p-6"
                  style={{
                    borderColor: "rgb(var(--xyvoo-blue-rgb) / 0.12)",
                    boxShadow: "0 4px 24px rgb(var(--xyvoo-navy-rgb) / 0.05)",
                  }}
                >
                  <Check
                    className="mt-0.5 h-5 w-5 shrink-0 text-xyvoo-blue"
                    aria-hidden
                  />
                  <span
                    className="text-[15px] leading-relaxed"
                    style={{ color: "var(--xyvoo-navy-muted-text)" }}
                  >
                    {item}
                  </span>
                </li>
              ))}
            </ul>
          </FadeIn>
        </div>
      </section>

      {/* Sticky stack — matches HomeWhyChoose scroll behaviour */}
      <section
        className="px-3 pb-10 md:px-6 md:pb-16"
        style={{ background: "var(--xyvoo-hms-features-bg)" }}
        aria-label="XYVOO HMS module overview"
      >
        <div className="mx-auto max-w-[1200px]">
          <FadeIn>
            <div className="px-5 pb-11 pt-2 text-center md:px-8 md:pb-[72px] md:pt-4">
              <SectionEyebrow
                eyebrow={
                  <>
                    <span
                      className="inline-block h-[5px] w-[5px] rounded-full"
                      style={{ background: "var(--xyvoo-blue)" }}
                    />
                    Ten modules
                  </>
                }
                title={
                  <>
                    Everything in V1,
                    <br />
                    <span
                      style={{
                        background: "var(--xyvoo-gradient-text)",
                        WebkitBackgroundClip: "text",
                        backgroundClip: "text",
                        WebkitTextFillColor: "transparent",
                      }}
                    >
                      one operating model.
                    </span>
                  </>
                }
                eyebrowClassName="mb-[18px] inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-[11.5px] font-semibold uppercase tracking-[0.13em]"
                titleClassName="mb-4 text-[clamp(1.625rem,4.4vw,2.75rem)] font-extrabold leading-[1.12]"
                className="[&>h2]:[color:var(--xyvoo-hms-features-headline)] [&>p]:[color:var(--xyvoo-hms-features-eyebrow-text)] [&>p]:[border-color:var(--xyvoo-hms-features-eyebrow-border)] [&>p]:[background:var(--xyvoo-hms-features-eyebrow-bg)]"
              />
              <p
                className="mx-auto max-w-[520px] text-[17px] leading-[1.65]"
                style={{ color: "var(--xyvoo-hms-features-subtext)" }}
              >
                Scroll through priority pillars — P0 launches first; P1 rounds out
                operations and back-office depth.
              </p>
            </div>
          </FadeIn>

          <div className="flex flex-col gap-6 md:pb-[20vh]">
            {SOLUTIONS_HOTEL_STACK_MODULES.map((module, index) => (
              <div
                key={module.id}
                className="relative md:sticky md:top-24"
                style={{ zIndex: index + 1 }}
              >
                <ModuleStackCard
                  module={module}
                  reverse={index % 2 === 1}
                  rowIndex={index}
                />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Integrations + onboarding — 2 col lg */}
      <section
        className="border-t border-slate-100 bg-white px-6 py-16 md:py-24"
        aria-labelledby="hotel-integrations-heading"
      >
        <div className="mx-auto grid max-w-[1200px] grid-cols-1 gap-14 lg:grid-cols-2 lg:gap-16">
          <FadeIn>
            <div>
              <h2
                id="hotel-integrations-heading"
                className="mb-3 text-2xl font-extrabold text-[var(--xyvoo-products-navy-alt)] md:text-[1.65rem]"
              >
                {SOLUTIONS_HOTEL_INTEGRATIONS_TITLE}
              </h2>
              <p
                className="mb-8 text-[15px] leading-relaxed"
                style={{ color: "var(--xyvoo-navy-muted-text)" }}
              >
                {SOLUTIONS_HOTEL_INTEGRATIONS_INTRO}
              </p>
              <ul className="flex flex-col gap-3">
                {SOLUTIONS_HOTEL_INTEGRATIONS_ITEMS.map((item) => (
                  <li key={item} className="flex gap-3 text-[15px] leading-relaxed">
                    <Check
                      className="mt-0.5 h-5 w-5 shrink-0 text-xyvoo-blue"
                      aria-hidden
                    />
                    <span style={{ color: "var(--xyvoo-navy-muted-text)" }}>
                      {item}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </FadeIn>
          <FadeIn delay={0.06}>
            <div>
              <h2 className="mb-8 text-2xl font-extrabold text-[var(--xyvoo-products-navy-alt)] md:text-[1.65rem]">
                {SOLUTIONS_HOTEL_ONBOARDING_TITLE}
              </h2>
              <ul className="flex flex-col gap-3">
                {SOLUTIONS_HOTEL_ONBOARDING_ITEMS.map((item) => (
                  <li key={item} className="flex gap-3 text-[15px] leading-relaxed">
                    <Check
                      className="mt-0.5 h-5 w-5 shrink-0 text-xyvoo-teal-product"
                      aria-hidden
                    />
                    <span style={{ color: "var(--xyvoo-navy-muted-text)" }}>
                      {item}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </FadeIn>
        </div>
      </section>
    </>
  );
}

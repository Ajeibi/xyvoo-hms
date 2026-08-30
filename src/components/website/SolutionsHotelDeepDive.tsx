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
  SOLUTIONS_HOTEL_STACK_MODULES,
  type SolutionsHotelStackModule,
} from "@/constants/solutions-hotel";
import { SolutionsHotelWhyOneSystem } from "@/components/website/SolutionsHotelWhyOneSystem";
import type { FadeInSectionProps } from "@/types";

/** Glass palette — a bare hint of the hero wheel's navy/teal frosted glass,
 * layered at low opacity over a white card rather than a dark one. */
const GLASS_NAVY_TINT = "rgba(58, 116, 196, 0.05)";
const GLASS_TEAL_TINT = "rgba(32, 168, 171, 0.05)";

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

/** Row layout: which modules share a row (2-up) vs stand alone (full width) */
const STACK_ROW_GROUPS: string[][] = [
  ["pms", "crs"],
  ["front-office"],
  ["housekeeping", "fb-pos"],
  ["billing"],
  ["cmms", "procurement"],
  ["hr"],
  ["analytics"],
];

type StackRow =
  | { kind: "single"; module: SolutionsHotelStackModule; tintIndex: number }
  | {
      kind: "pair";
      modules: [SolutionsHotelStackModule, SolutionsHotelStackModule];
      tintIndexes: [number, number];
    };

function buildStackRows(): StackRow[] {
  const moduleById = new Map(
    SOLUTIONS_HOTEL_STACK_MODULES.map((m) => [m.id, m]),
  );
  let tintIndex = 0;
  return STACK_ROW_GROUPS.map((ids) => {
    const modules = ids
      .map((id) => moduleById.get(id))
      .filter((m): m is SolutionsHotelStackModule => Boolean(m));
    if (modules.length === 2) {
      const tintIndexes: [number, number] = [tintIndex, tintIndex + 1];
      tintIndex += 2;
      return { kind: "pair" as const, modules: modules as [SolutionsHotelStackModule, SolutionsHotelStackModule], tintIndexes };
    }
    const idx = tintIndex;
    tintIndex += 1;
    return { kind: "single" as const, module: modules[0], tintIndex: idx };
  });
}

const STACK_ROWS = buildStackRows();

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
  const isTeal = rowIndex % 2 === 1;
  const glassTint = isTeal ? GLASS_TEAL_TINT : GLASS_NAVY_TINT;

  return (
    <div
      className={`grid min-h-[480px] grid-cols-1 items-center overflow-hidden rounded-[20px] border backdrop-blur-md md:min-h-[520px] md:grid-cols-2 ${
        reverse ? "md:[&>*:first-child]:order-2" : ""
      }`}
      style={{
        background: `linear-gradient(${glassTint}, ${glassTint}), var(--xyvoo-white)`,
        borderColor: "var(--xyvoo-hms-features-row-border)",
        boxShadow:
          "var(--xyvoo-hms-features-row-shadow-lg), var(--xyvoo-hms-features-row-shadow-sm)",
      }}
    >
      <div className="flex flex-col px-5 pb-5 pt-9 sm:px-8 sm:pb-6 sm:pt-11 md:px-[72px] md:pb-[72px] md:pt-[72px]">
        <div
          className="mb-3 text-[11px] font-bold uppercase tracking-[0.16em]"
          style={{ color: "var(--xyvoo-blue)" }}
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
          </div>
        </div>
      </div>
    </div>
  );
}

/** Compact variant for 2-up rows — bold, solid navy/teal (not the subtle
 * glass hint the full-width rows use) so the page doesn't read as one flat
 * treatment the whole way down. Navy is dark (white text); teal-product is
 * light (dark text) — each card's text picks whichever reads clearly. */
function CompactModuleCard({
  module,
  tintIndex,
}: {
  module: SolutionsHotelStackModule;
  tintIndex: number;
}) {
  const Icon = STACK_ICON_BY_ID[module.id] ?? BarChart2;
  const isTeal = tintIndex % 2 === 1;
  const textColor = isTeal ? "var(--xyvoo-navy)" : "var(--xyvoo-white)";
  const mutedText = isTeal
    ? "rgb(var(--xyvoo-navy-rgb) / 0.68)"
    : "rgba(255, 255, 255, 0.75)";
  const accentColor = isTeal ? "var(--xyvoo-navy)" : "var(--xyvoo-blue-light)";

  return (
    <div
      className="flex h-full flex-col rounded-[20px] px-6 py-8 shadow-[0_20px_45px_rgba(0,13,31,0.18)] sm:px-8 sm:py-9"
      style={{
        background: isTeal
          ? "var(--xyvoo-teal-product)"
          : "var(--xyvoo-navy)",
      }}
    >
      <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-[12px] bg-white">
        <Icon className="h-5 w-5 text-xyvoo-blue" aria-hidden />
      </div>
      <div
        className="mb-2 text-[11px] font-bold uppercase tracking-[0.16em]"
        style={{ color: accentColor }}
      >
        {module.number}
      </div>
      <h3
        className="mb-3 whitespace-pre-line font-extrabold leading-[1.18] text-[clamp(1.3rem,2.4vw,1.55rem)]"
        style={{ color: textColor }}
      >
        {module.title}
      </h3>
      <p className="mb-5 text-[14.5px] leading-[1.7]" style={{ color: mutedText }}>
        {module.description}
      </p>
      <div className="mb-6 flex flex-col gap-[10px]">
        {module.bullets.map((bullet) => (
          <div
            key={bullet}
            className="flex items-start gap-[11px] text-[13.5px] leading-[1.5]"
            style={{ color: mutedText }}
          >
            <span
              className="mt-[5px] h-[6px] w-[6px] shrink-0 rounded-full"
              style={{ background: accentColor }}
            />
            <span>{bullet}</span>
          </div>
        ))}
      </div>
      <Link
        href="/register"
        className="mt-auto inline-flex items-center gap-2 text-sm font-semibold"
        style={{ color: accentColor }}
      >
        Get started
        <ArrowRight className="h-4 w-4" />
      </Link>
    </div>
  );
}

/** Sticky-stack row: plain position:sticky + increasing z-index, so each row
 * covers the previous one as it scrolls up. No opacity/transform animation
 * here — a transform on a sticky element breaks its sticky behaviour in the
 * browser, which is exactly what happened the last time this had a fade. */
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

export function SolutionsHotelDeepDive() {
  return (
    <>
      <SolutionsHotelWhyOneSystem />

      {/* Sticky stack — matches HomeWhyChoose scroll behaviour */}
      <section
        className="px-3 pb-10 md:px-6 md:pb-16"
        style={{ background: "var(--xyvoo-white)" }}
        aria-label="XYVOO HMS module overview"
      >
        <div className="mx-auto max-w-[1200px]">
          <FadeIn>
            <div className="px-5 pb-11 pt-11 text-center md:px-8 md:pb-[72px] md:pt-[72px]">
              <h2
                className="mb-4 text-balance text-[clamp(1.625rem,4.4vw,2.75rem)] font-extrabold leading-[1.12]"
                style={{ color: "var(--xyvoo-navy)" }}
              >
                Every department,
                <br />
                one operating model.
              </h2>
            </div>
          </FadeIn>

          <div className="flex flex-col gap-6 md:pb-[20vh]">
            {STACK_ROWS.map((row, rowPos) => (
              <StackRow
                key={
                  row.kind === "single"
                    ? row.module.id
                    : row.modules.map((m) => m.id).join("-")
                }
                zIndex={rowPos + 1}
              >
                {row.kind === "single" ? (
                  <ModuleStackCard
                    module={row.module}
                    reverse={row.tintIndex % 2 === 1}
                    rowIndex={row.tintIndex}
                  />
                ) : (
                  <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                    <CompactModuleCard
                      module={row.modules[0]}
                      tintIndex={row.tintIndexes[0]}
                    />
                    <CompactModuleCard
                      module={row.modules[1]}
                      tintIndex={row.tintIndexes[1]}
                    />
                  </div>
                )}
              </StackRow>
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

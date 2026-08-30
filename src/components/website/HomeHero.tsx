"use client";

import { useState, useEffect, type CSSProperties, type ReactNode } from "react";
import Link from "next/link";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { XYVOO_AUTH_ROUTES } from "@/constants/auth-links";

const XYVOO_SHIELD = "/images/XYVOO%20Shield.png" as const;
/** Shared placeholder until Company/Storefront get their own dedicated photos. */
const GENERIC_HERO_IMAGE =
  "/images/background%20images/xyvoo.png" as const;
const HMS_HERO_IMAGE =
  "/images/background%20images/receptionBg.png" as const;
const STORE_HERO_IMAGE =
  "/images/background%20images/storefront-bg3.png" as const;

const HERO_IMAGE_WIDTH = 2400;
const HERO_IMAGE_HEIGHT = 1600;

type HeroTabId = "company" | "hms" | "store";

type HeroTab = {
  id: HeroTabId;
  pillLabel: string;
  /**
   * Full-bleed section background. Deeper than the equivalent brand accent
   * token (`--xyvoo-blue` / `--xyvoo-teal-product`) on purpose — white body
   * text at these depths clears WCAG AA (4.5:1) at any weight/size, whereas
   * the lighter accent tones only pass for large/bold text.
   */
  bg: string;
  bgGradient?: string;
  /** Text colour for the active (white) pill — the vivid accent tone reads best here. */
  pillActiveText: string;
  /** Eyebrow + link accent colour against the dark section background. */
  accentText: string;
  /** Colour of the animated grid-line pulses. Defaults to accentText — override when accentText is too vivid/dark for a travelling light streak (e.g. the near-white Company background needs a soft light-blue rather than the bold CTA blue). */
  pulseColor?: string;
  /** "stacked" = centered copy over a full-width image bleeding to the bottom (original layout). "split" = copy on one side, image bleeding to the opposite screen edge. */
  layout: "stacked" | "split";
  /** Which edge the image bleeds to when layout is "split" (copy sits on the other side). */
  imageSide?: "left" | "right";
  /** Tailwind width class for the image column when layout is "split". Defaults to "w-1/2". A wider value intentionally extends the image under the text column (text stays on top via z-index). */
  imageWidthClass?: string;
  eyebrow: string;
  headline: string;
  subhead: string;
  image: string;
  imageAlt: string;
  primaryCta: { label: string; href: string };
  secondaryCta?: { label: string; href: string };
  isDarkTheme?: boolean;
};

const HERO_TABS: HeroTab[] = [
  {
    id: "company",
    pillLabel: "XYVOO",
    bg: "#f8fafc",
    pillActiveText: "#07162c",
    accentText: "#007edf",
    pulseColor: "#90caf9",
    layout: "stacked",
    eyebrow: "One company. Two platforms.",
    headline: "Software that runs your business — not the other way round.",
    subhead:
      "XYVOO builds dedicated, fully branded platforms for hotels and online retailers, so your team runs on one system instead of ten disconnected tools.",
    image: GENERIC_HERO_IMAGE,
    imageAlt: "XYVOO platform preview",
    primaryCta: { label: "Learn more about XYVOO", href: "#about-xyvoo" },
    isDarkTheme: false,
  },
  {
    id: "hms",
    pillLabel: "HMS",
    bg: "#000d1f",
    pillActiveText: "#000d1f",
    accentText: "#90caf9",
    layout: "stacked",
    eyebrow: "For Hotels & Properties",
    headline: "Hotel management, fully under your brand.",
    subhead:
      "Front desk, housekeeping, F&B, billing and reporting — one system. Guests and staff never see XYVOO.",
    image: HMS_HERO_IMAGE,
    imageAlt: "Hotel front desk receptionist using the XYVOO HMS",
    primaryCta: {
      label: "Launch your HMS",
      href: XYVOO_AUTH_ROUTES.hms.register,
    },
    secondaryCta: { label: "Explore HMS", href: "/solution/hms" },
  },
  {
    id: "store",
    pillLabel: "Storefront",
    bg: "#0b3d38",
    pillActiveText: "#0b3d38",
    accentText: "#4dd0c4",
    layout: "stacked",
    eyebrow: "For Retailers & Merchants",
    headline: "Your online store, built to sell.",
    subhead:
      "A fully branded storefront with catalogue, checkout and fulfilment — live in minutes, not months.",
    image: STORE_HERO_IMAGE,
    imageAlt: "XYVOO Storefront preview",
    primaryCta: {
      label: "Start your online store",
      href: XYVOO_AUTH_ROUTES.store.register,
    },
    secondaryCta: { label: "Explore Storefront", href: "/solutions/store" },
  },
];

const getGridImage = (isDark: boolean): string => {
  return isDark
    ? `linear-gradient(to right, rgba(255, 255, 255, 0.01) 1px, transparent 1px),
       linear-gradient(to bottom, rgba(255, 255, 255, 0.01) 1px, transparent 1px)`
    : `linear-gradient(to right, rgba(7, 22, 44, 0.04) 1px, transparent 1px),
       linear-gradient(to bottom, rgba(7, 22, 44, 0.04) 1px, transparent 1px)`;
};

function FloatingCard({
  children,
  className,
  yOffset = 15,
  duration = 4,
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  yOffset?: number;
  duration?: number;
  delay?: number;
}) {
  return (
    <motion.div
      className={`backdrop-blur-md bg-white/40 border border-white/60 shadow-[0_8px_32px_rgba(7,22,44,0.06)] rounded-2xl p-4 size-fit ${className}`}
      animate={{
        y: [0, -yOffset, 0],
      }}
      transition={{
        duration,
        repeat: Infinity,
        ease: "easeInOut",
        delay,
      }}
    >
      {children}
    </motion.div>
  );
}

function TabsRow({
  activeId,
  onSelect,
  align,
  isDarkTheme,
}: {
  activeId: HeroTabId;
  onSelect: (id: HeroTabId) => void;
  align: "center" | "left";
  isDarkTheme: boolean;
}) {
  return (
    <div
      role="tablist"
      aria-label="XYVOO products"
      className={
        "mb-10 flex flex-wrap gap-3" + (align === "center" ? " justify-center" : "")
      }
    >
      {HERO_TABS.map((tab) => {
        const isActive = tab.id === activeId;

        let buttonStyle: CSSProperties = {};
        if (isActive) {
          if (isDarkTheme) {
            buttonStyle = {
              background: "#fff",
              color: tab.pillActiveText,
              opacity: 1,
              boxShadow: "0 8px 20px rgba(0,0,0,0.18)",
            };
          } else {
            buttonStyle = {
              background: "#07162c",
              color: "#fff",
              opacity: 1,
              boxShadow: "0 8px 20px rgba(7,22,44,0.18)",
            };
          }
        } else {
          if (isDarkTheme) {
            buttonStyle = {
              background: "rgba(255,255,255,0.12)",
              color: "#fff",
              opacity: 0.45,
            };
          } else {
            buttonStyle = {
              background: "rgba(7, 22, 44, 0.06)",
              color: "#07162c",
              opacity: 0.6,
            };
          }
        }

        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onSelect(tab.id)}
            className="flex cursor-pointer items-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold transition-all duration-200 hover:opacity-100"
            style={buttonStyle}
          >
            <Image src={XYVOO_SHIELD} alt="" width={20} height={20} className="size-5 shrink-0" />
            {tab.pillLabel}
          </button>
        );
      })}
    </div>
  );
}

function HeroCopy({
  tab,
  align,
}: {
  tab: HeroTab;
  align: "center" | "left" | "store-custom";
}) {
  const isCenter = align === "center";
  const isStoreCustom = align === "store-custom";
  const isDark = tab.isDarkTheme !== false;

  return (
    <div
      className={
        isCenter
          ? "mx-auto max-w-4xl text-center"
          : isStoreCustom
            ? "mx-auto max-w-2xl text-center md:max-w-lg md:ml-auto md:mr-0 md:text-left"
            : "text-left"
      }
    >
      <p
        className="mb-4 text-xs font-bold uppercase tracking-[0.2em]"
        style={{ color: tab.accentText }}
      >
        {tab.eyebrow}
      </p>
      <h1 className={
        "mb-5 text-balance text-4xl font-black leading-[1.08] tracking-tight md:text-5xl lg:text-[2.75rem] lg:leading-[1.12] " +
        (isDark ? "text-white" : "text-[#07162c]")
      }>
        {tab.headline}
      </h1>
      <p
        className={
          "mb-10 text-pretty text-base leading-relaxed md:text-lg " +
          (isDark ? "text-white" : "text-[#334155]") + " " +
          (isCenter
            ? "mx-auto max-w-2xl"
            : isStoreCustom
              ? "mx-auto max-w-2xl md:max-w-none"
              : "max-w-lg")
        }
      >
        {tab.subhead}
      </p>
      <div
        className={
          "flex flex-col items-stretch gap-3 sm:flex-row sm:items-center " +
          (isCenter
            ? "justify-center"
            : isStoreCustom
              ? "justify-center md:justify-start"
              : "")
        }
      >
        <Link
          href={tab.primaryCta.href}
          className={
            "group/button inline-flex w-full items-center justify-center gap-2 rounded-full px-7 py-3.5 text-[15px] font-semibold shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg sm:w-auto " +
            (isDark
              ? "bg-white text-[var(--xyvoo-navy)] hover:bg-slate-50"
              : "border border-[var(--xyvoo-blue)] bg-[#07162c] text-white hover:bg-black")
          }
        >
          {tab.primaryCta.label}
          <ArrowRight className="size-4 transition-transform duration-200 group-hover/button:translate-x-0.5" />
        </Link>
        {tab.secondaryCta ? (
          <Link
            href={tab.secondaryCta.href}
            className={
              "inline-flex w-full items-center justify-center gap-1.5 px-4 py-3.5 text-[15px] font-semibold underline-offset-4 hover:underline sm:w-auto " +
              (isDark ? "text-white" : "text-[#07162c]")
            }
          >
            {tab.secondaryCta.label}
            <ArrowRight className="size-4" />
          </Link>
        ) : null}
      </div>
    </div>
  );
}

function FadeSwap({
  id,
  className,
  children,
}: {
  id: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <AnimatePresence initial={false} mode="popLayout">
      <motion.div
        key={id}
        className={className}
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: "easeOut" }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}

function GridPulses({ active }: { active: HeroTab }) {
  const pulseColor = active.pulseColor ?? active.accentText;
  // Plain CSS drop-shadow instead of an SVG <filter> reference: if an SVG
  // filter fails to resolve (browser quirks, timing), the whole element it's
  // attached to renders invisible rather than just losing the glow — that
  // silent-invisibility failure mode is what was making these pulses vanish
  // entirely. drop-shadow degrades gracefully instead.
  const glowStyle: CSSProperties = {
    filter: `drop-shadow(0 0 4px ${pulseColor}) drop-shadow(0 0 1.5px ${pulseColor})`,
  };

  // Comet trail built from plain filled circles at shrinking size/opacity
  // (not an SVG <linearGradient> reference) — same reasoning as the glow
  // above: url(#...) references in this environment have shown a
  // fail-invisible failure mode, so the trail avoids that mechanism too.
  const TRAIL = [
    { offset: 6, r: 1.6, opacity: 0.45 },
    { offset: 12, r: 1.1, opacity: 0.25 },
    { offset: 18, r: 0.7, opacity: 0.12 },
  ];

  // Small glowing dot ("light bulb"), moving slowly along the full length
  // of its track via a CSS transform, trailed by the comet dots above.
  // Spread across the full section (not clustered in one corner) so there's
  // enough of them on screen at once to read as "alive" rather than sparse.
  const hLocations = [
    { y: 80, duration: 24, delay: 0 },
    { y: 160, duration: 31, delay: 4 },
    { y: 240, duration: 20, delay: 9 },
    { y: 320, duration: 35, delay: 13 },
    { y: 400, duration: 26, delay: 18 },
    { y: 480, duration: 22, delay: 1 },
    { y: 560, duration: 33, delay: 7 },
    { y: 640, duration: 28, delay: 12 },
    { y: 720, duration: 24, delay: 16 },
    { y: 800, duration: 37, delay: 3 },
    { y: 880, duration: 21, delay: 19 },
    { y: 960, duration: 30, delay: 8 },
  ];
  const vLocations = [
    { x: 80, duration: 27, delay: 2 },
    { x: 240, duration: 33, delay: 6 },
    { x: 400, duration: 22, delay: 11 },
    { x: 560, duration: 36, delay: 15 },
    { x: 720, duration: 25, delay: 20 },
    { x: 880, duration: 29, delay: 5 },
    { x: 1040, duration: 23, delay: 14 },
    { x: 1200, duration: 34, delay: 0 },
    { x: 1360, duration: 20, delay: 10 },
    { x: 1520, duration: 31, delay: 17 },
    { x: 1680, duration: 26, delay: 21 },
    { x: 1840, duration: 38, delay: 9 },
  ];

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden z-0">
      <svg className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
        {hLocations.map((h, i) => (
          <g key={`h-${i}`} className={`animate-grid-dot-h-${i}`}>
            {TRAIL.map((t, ti) => (
              <circle key={ti} cx={-t.offset} cy={h.y} r={t.r} fill={pulseColor} opacity={t.opacity} />
            ))}
            <circle cx="0" cy={h.y} r="2.5" fill={pulseColor} style={glowStyle} />
          </g>
        ))}
        {vLocations.map((v, i) => (
          <g key={`v-${i}`} className={`animate-grid-dot-v-${i}`}>
            {TRAIL.map((t, ti) => (
              <circle key={ti} cx={v.x} cy={-t.offset} r={t.r} fill={pulseColor} opacity={t.opacity} />
            ))}
            <circle cx={v.x} cy="0" r="2.5" fill={pulseColor} style={glowStyle} />
          </g>
        ))}
      </svg>
      <style>{`
        @keyframes gridDotH {
          0% { transform: translateX(0); opacity: 0; }
          8% { opacity: 1; }
          92% { opacity: 1; }
          100% { transform: translateX(3000px); opacity: 0; }
        }
        @keyframes gridDotV {
          0% { transform: translateY(0); opacity: 0; }
          8% { opacity: 1; }
          92% { opacity: 1; }
          100% { transform: translateY(3000px); opacity: 0; }
        }
        ${hLocations
          .map(
            (h, i) =>
              `.animate-grid-dot-h-${i} { animation: gridDotH ${h.duration}s linear infinite; animation-delay: ${h.delay}s; }`
          )
          .join("\n")}
        ${vLocations
          .map(
            (v, i) =>
              `.animate-grid-dot-v-${i} { animation: gridDotV ${v.duration}s linear infinite; animation-delay: ${v.delay}s; }`
          )
          .join("\n")}
      `}</style>
    </div>
  );
}

const HERO_AUTOPLAY_MS = 10000;

export function HomeHero() {
  const [activeId, setActiveId] = useState<HeroTabId>("company");
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const active = HERO_TABS.find((tab) => tab.id === activeId) ?? HERO_TABS[0];
  const isDark = active.isDarkTheme !== false;

  useEffect(() => {
    const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
    setPrefersReducedMotion(mql.matches);
    const handleChange = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches);
    mql.addEventListener("change", handleChange);
    return () => mql.removeEventListener("change", handleChange);
  }, []);

  // Auto-advance every 5s; only reduced-motion preference stops it
  // (WCAG 2.3.3 — respect the user's OS-level motion setting).
  useEffect(() => {
    if (prefersReducedMotion) return;
    const timer = setTimeout(() => {
      setActiveId((current) => {
        const index = HERO_TABS.findIndex((tab) => tab.id === current);
        return HERO_TABS[(index + 1) % HERO_TABS.length].id;
      });
    }, HERO_AUTOPLAY_MS);
    return () => clearTimeout(timer);
  }, [activeId, prefersReducedMotion]);

  useEffect(() => {
    const sendTheme = () => {
      window.dispatchEvent(
        new CustomEvent("heroThemeChange", {
          detail: { isDark, bg: active.bg, id: active.id },
        })
      );
    };
    sendTheme();
    window.addEventListener("requestHeroTheme", sendTheme);
    return () => window.removeEventListener("requestHeroTheme", sendTheme);
  }, [isDark, active.bg, active.id]);

  const sectionStyle: CSSProperties = {
    backgroundColor: active.bg,
    backgroundImage: active.bgGradient
      ? `${getGridImage(isDark)}, ${active.bgGradient}`
      : getGridImage(isDark),
    backgroundSize: active.bgGradient ? "40px 40px, auto" : "40px 40px",
  };

  return (
    <section
      className={
        "relative isolate w-full overflow-hidden pb-0 transition-all duration-300 " +
        (activeId === "store" || activeId === "hms" ? "pt-20" : "pt-28")
      }
      style={sectionStyle}
    >
      <GridPulses active={active} />
      <div className={
        "relative z-10 w-full pb-4 transition-all duration-300 " +
        (activeId === "store" || activeId === "hms" ? "pt-10 lg:pt-16" : "pt-2")
      }>
        <div className="mx-auto max-w-4xl px-6">
          <TabsRow activeId={activeId} onSelect={setActiveId} align="center" isDarkTheme={isDark} />
        </div>
        <div className="mx-auto max-w-4xl px-6">
          <FadeSwap id={active.id}>
            <HeroCopy tab={active} align="center" />
          </FadeSwap>
        </div>
      </div>

      <div
        className={
          "relative z-0 transition-all duration-300 " +
          (active.id === "store" || active.id === "hms" ? "lg:-mt-[400px]" : "lg:-mt-[150px]")
        }
      >
        <Image
          src={active.image}
          alt={active.imageAlt}
          width={HERO_IMAGE_WIDTH}
          height={HERO_IMAGE_HEIGHT}
          priority
          sizes="(max-width: 768px) 100vw, 2000px"
          className="relative z-0 block h-auto w-full min-w-0 max-w-none"
          style={{ width: "100%", height: "auto" }}
        />

        {active.id === "company" && (
          <>
            {/* --- LEFT SIDE CARDS --- */}

            {/* Left Card 1 - Hotel Room Status (Blue) */}
            <FloatingCard
              className="absolute left-[19%] top-[15%] hidden xl:flex items-center gap-3"
              yOffset={10}
              duration={5}
              delay={0}
            >
              <div className="size-10 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-600">
                <svg className="size-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
              </div>
              <div className="text-left">
                <p className="text-[11px] font-bold text-blue-600 uppercase tracking-wider">Solas Boutique Hotel</p>
                <h4 className="text-[14px] font-extrabold text-[#07162c] leading-tight">Room 102 Checked In</h4>
                <p className="text-[11px] font-medium text-slate-500">XYVOO HMS • Live</p>
              </div>
            </FloatingCard>

            {/* Left Card 2 - Store Order (Emerald) */}
            <FloatingCard
              className="absolute left-[4%] top-[25%] hidden xl:flex items-center gap-3"
              yOffset={14}
              duration={6.5}
              delay={0.7}
            >
              <div className="size-10 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-600">
                <svg className="size-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
                </svg>
              </div>
              <div className="text-left">
                <p className="text-[11px] font-bold text-emerald-600 uppercase tracking-wider">Luxe Threads</p>
                <h4 className="text-[14px] font-extrabold text-[#07162c] leading-tight">New Order #5102</h4>
                <p className="text-[11px] font-medium text-slate-500">$189.50 • Live Store</p>
              </div>
            </FloatingCard>

            {/* Left Card 3 - Hotel Reservation (Cyan) */}
            <FloatingCard
              className="absolute left-[5%] top-[45%] hidden xl:flex items-center gap-3"
              yOffset={12}
              duration={5.5}
              delay={1.4}
            >
              <div className="size-10 rounded-xl bg-cyan-500/10 flex items-center justify-center text-cyan-600">
                <svg className="size-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <div className="text-left">
                <p className="text-[11px] font-bold text-cyan-600 uppercase tracking-wider">Grand Plaza Resort</p>
                <h4 className="text-[14px] font-extrabold text-[#07162c] leading-tight">Reservation Confirmed</h4>
                <p className="text-[11px] font-medium text-slate-500">XYVOO HMS • Live</p>
              </div>
            </FloatingCard>

            {/* Left Card 4 - Store SEO (Violet) */}
            <FloatingCard
              className="absolute left-[18%] top-[72%] hidden xl:flex items-center gap-3"
              yOffset={15}
              duration={7}
              delay={2.1}
            >
              <div className="size-10 rounded-xl bg-violet-500/10 flex items-center justify-center text-violet-600">
                <svg className="size-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                </svg>
              </div>
              <div className="text-left">
                <p className="text-[11px] font-bold text-violet-600 uppercase tracking-wider">Apex Goods</p>
                <h4 className="text-[14px] font-extrabold text-[#07162c] leading-tight">SEO Keyword Ranked #1</h4>
                <p className="text-[11px] font-medium text-slate-500">Google Search • Live</p>
              </div>
            </FloatingCard>

            {/* --- RIGHT SIDE CARDS --- */}

            {/* Right Card 1 - Store Order (Emerald) - Stray outside to text */}
            <FloatingCard
              className="absolute right-[12%] top-[-8%] hidden xl:flex items-center gap-3"
              yOffset={15}
              duration={6}
              delay={0.3}
            >
              <div className="size-10 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-600">
                <svg className="size-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
                </svg>
              </div>
              <div className="text-left">
                <p className="text-[11px] font-bold text-emerald-600 uppercase tracking-wider">Velo Bike Shop</p>
                <h4 className="text-[14px] font-extrabold text-[#07162c] leading-tight">New Order #4802</h4>
                <p className="text-[11px] font-medium text-slate-500">$1,240.00 • Live Store</p>
              </div>
            </FloatingCard>

            {/* Right Card 2 - Hotel Finance (Indigo) */}
            <FloatingCard
              className="absolute right-[4%] top-[24%] hidden xl:flex items-center gap-3"
              yOffset={13}
              duration={5.8}
              delay={1.0}
            >
              <div className="size-10 rounded-xl bg-indigo-500/10 flex items-center justify-center text-indigo-600">
                <svg className="size-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div className="text-left">
                <p className="text-[11px] font-bold text-indigo-600 uppercase tracking-wider">Valeria Resort</p>
                <h4 className="text-[14px] font-extrabold text-[#07162c] leading-tight">Invoice Paid: $1,420.00</h4>
                <p className="text-[11px] font-medium text-slate-500">XYVOO HMS • Live</p>
              </div>
            </FloatingCard>

            {/* Right Card 3 - Store SEO (Fuchsia) */}
            <FloatingCard
              className="absolute right-[5%] top-[48%] hidden xl:flex items-center gap-3"
              yOffset={13}
              duration={6.8}
              delay={1.7}
            >
              <div className="size-10 rounded-xl bg-fuchsia-500/10 flex items-center justify-center text-fuchsia-600">
                <svg className="size-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
              <div className="text-left">
                <p className="text-[11px] font-bold text-fuchsia-600 uppercase tracking-wider">Nova Cosmetics</p>
                <h4 className="text-[14px] font-extrabold text-[#07162c] leading-tight">Sitemap Indexed by Google</h4>
                <p className="text-[11px] font-medium text-slate-500">SEO Health: 100%</p>
              </div>
            </FloatingCard>

            {/* Right Card 4 - Hotel Procurement (Amber) */}
            <FloatingCard
              className="absolute right-[20%] top-[68%] hidden xl:flex items-center gap-3"
              yOffset={12}
              duration={5.2}
              delay={2.4}
            >
              <div className="size-10 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-600">
                <svg className="size-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                </svg>
              </div>
              <div className="text-left">
                <p className="text-[11px] font-bold text-amber-600 uppercase tracking-wider">Siren Cove Resort</p>
                <h4 className="text-[14px] font-extrabold text-[#07162c] leading-tight">Procurement Order Approved</h4>
                <p className="text-[11px] font-medium text-slate-500">PO #8109 • Pending Delivery</p>
              </div>
            </FloatingCard>
          </>
        )}

        {active.id === "hms" && (
          <>
            {/* Left Card 1 - Hotel Room Status (Blue) */}
            <FloatingCard
              className="absolute left-[19%] top-[15%] hidden xl:flex items-center gap-3"
              yOffset={10}
              duration={5}
              delay={0}
            >
              <div className="size-10 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-600">
                <svg className="size-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
              </div>
              <div className="text-left">
                <p className="text-[11px] font-bold text-blue-600 uppercase tracking-wider">Solas Boutique Hotel</p>
                <h4 className="text-[14px] font-extrabold text-[#07162c] leading-tight">Room 102 Checked In</h4>
                <p className="text-[11px] font-medium text-slate-500">XYVOO HMS • Live</p>
              </div>
            </FloatingCard>

            {/* Left Card 2 - Hotel Reservation (Cyan) */}
            <FloatingCard
              className="absolute left-[5%] top-[45%] hidden xl:flex items-center gap-3"
              yOffset={12}
              duration={5.5}
              delay={1.4}
            >
              <div className="size-10 rounded-xl bg-cyan-500/10 flex items-center justify-center text-cyan-600">
                <svg className="size-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <div className="text-left">
                <p className="text-[11px] font-bold text-cyan-600 uppercase tracking-wider">Grand Plaza Resort</p>
                <h4 className="text-[14px] font-extrabold text-[#07162c] leading-tight">Reservation Confirmed</h4>
                <p className="text-[11px] font-medium text-slate-500">XYVOO HMS • Live</p>
              </div>
            </FloatingCard>

            {/* Right Card 1 - Hotel Finance (Indigo) */}
            <FloatingCard
              className="absolute right-[4%] top-[24%] hidden xl:flex items-center gap-3"
              yOffset={13}
              duration={5.8}
              delay={1.0}
            >
              <div className="size-10 rounded-xl bg-indigo-500/10 flex items-center justify-center text-indigo-600">
                <svg className="size-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div className="text-left">
                <p className="text-[11px] font-bold text-indigo-600 uppercase tracking-wider">Valeria Resort</p>
                <h4 className="text-[14px] font-extrabold text-[#07162c] leading-tight">Invoice Paid: $1,420.00</h4>
                <p className="text-[11px] font-medium text-slate-500">XYVOO HMS • Live</p>
              </div>
            </FloatingCard>

            {/* Right Card 2 - Hotel Procurement (Amber) */}
            <FloatingCard
              className="absolute right-[20%] top-[68%] hidden xl:flex items-center gap-3"
              yOffset={12}
              duration={5.2}
              delay={2.4}
            >
              <div className="size-10 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-600">
                <svg className="size-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                </svg>
              </div>
              <div className="text-left">
                <p className="text-[11px] font-bold text-amber-600 uppercase tracking-wider">Siren Cove Resort</p>
                <h4 className="text-[14px] font-extrabold text-[#07162c] leading-tight">Procurement Order Approved</h4>
                <p className="text-[11px] font-medium text-slate-500">PO #8109 • Pending Delivery</p>
              </div>
            </FloatingCard>
          </>
        )}

        {active.id === "store" && (
          <>
            {/* Left Card - Cart Addition (Emerald) */}
            <FloatingCard
              className="absolute left-[4%] top-[35%] hidden xl:flex items-center gap-3"
              yOffset={14}
              duration={6.5}
              delay={0.7}
            >
              <div className="size-10 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-600">
                <svg className="size-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
              </div>
              <div className="text-left">
                <p className="text-[11px] font-bold text-emerald-600 uppercase tracking-wider">Live Activity</p>
                <h4 className="text-[14px] font-extrabold text-[#07162c] leading-tight">Scarf Added to Cart</h4>
                <p className="text-[11px] font-medium text-slate-500">Lagos, NG • 2s ago</p>
              </div>
            </FloatingCard>

            {/* Right Card - DHL Shipping Update (Amber) */}
            <FloatingCard
              className="absolute right-[18%] top-[56%] hidden xl:flex items-center gap-3"
              yOffset={12}
              duration={5.2}
              delay={1.4}
            >
              <div className="size-10 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-600">
                <svg className="size-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                </svg>
              </div>
              <div className="text-left">
                <p className="text-[11px] font-bold text-amber-600 uppercase tracking-wider">Logistics</p>
                <h4 className="text-[14px] font-extrabold text-[#07162c] leading-tight">Shipped via DHL</h4>
                <p className="text-[11px] font-medium text-slate-500">Tracking #8920 • Handed Over</p>
              </div>
            </FloatingCard>
          </>
        )}
      </div>
    </section>
  );
}

"use client";

import { useState, useEffect, type CSSProperties, type ReactNode } from "react";
import Link from "next/link";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { XYVOO_AUTH_ROUTES } from "@/constants/auth-links";
import { GridPulses } from "@/components/website/GridPulses";

const XYVOO_SHIELD = "/images/XYVOO%20Shield.png" as const;
type HeroTabId = "company" | "hms" | "storefront";

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
  eyebrow: string;
  headline: string;
  subhead: string;
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
    accentText: "#1565c0",
    pulseColor: "#90caf9",
    eyebrow: "One company. Two platforms.",
    headline: "Software that runs your business, not the other way round.",
    subhead:
      "XYVOO builds dedicated, fully branded platforms for hotels and online retailers, giving your team one seamless system to run your business instead of juggling ten disconnected tools.",
    primaryCta: { label: "Learn more about XYVOO", href: "/about" },
    isDarkTheme: false,
  },
  {
    id: "hms",
    pillLabel: "HMS",
    bg: "#000d1f",
    pillActiveText: "#000d1f",
    accentText: "#90caf9",
    eyebrow: "For Hotels & Properties",
    headline: "Hotel management, fully under your brand.",
    subhead:
      "Front desk, housekeeping, F&B, billing and reporting in one system. Guests and staff never see XYVOO.",
    primaryCta: {
      label: "Launch your HMS",
      href: XYVOO_AUTH_ROUTES.hms.register,
    },
    secondaryCta: { label: "Explore HMS", href: "/solution/hms" },
  },
  {
    id: "storefront",
    pillLabel: "Storefront",
    bg: "#04140f",
    pillActiveText: "#04140f",
    accentText: "#4dd0c4",
    eyebrow: "For Retailers & Merchants",
    headline: "Your online storefront, built to sell.",
    subhead:
      "A fully branded storefront with catalogue, checkout and fulfilment, live in minutes, not months.",
    primaryCta: {
      label: "Start your online storefront",
      href: XYVOO_AUTH_ROUTES.storefront.register,
    },
    secondaryCta: { label: "Explore Storefront", href: "/solution/storefront" },
  },
];

const getGridImage = (isDark: boolean): string => {
  return isDark
    ? `linear-gradient(to right, rgba(255, 255, 255, 0.01) 1px, transparent 1px),
       linear-gradient(to bottom, rgba(255, 255, 255, 0.01) 1px, transparent 1px)`
    : `linear-gradient(to right, rgba(7, 22, 44, 0.04) 1px, transparent 1px),
       linear-gradient(to bottom, rgba(7, 22, 44, 0.04) 1px, transparent 1px)`;
};

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
  align: "center" | "left" | "storefront-custom";
}) {
  const isCenter = align === "center";
  const isStorefrontCustom = align === "storefront-custom";
  const isDark = tab.isDarkTheme !== false;

  return (
    <div
      className={
        isCenter
          ? "mx-auto max-w-4xl text-center"
          : isStorefrontCustom
            ? "mx-auto max-w-2xl text-center md:max-w-lg md:ml-auto md:mr-0 md:text-left"
            : "text-left"
      }
    >
      <p
        className="mb-4 text-eyebrow font-bold uppercase tracking-[0.2em]"
        style={{ color: tab.accentText }}
      >
        {tab.eyebrow}
      </p>
      <h1 id="home-hero-heading" className={
        "mb-5 text-balance text-h1 font-black leading-[1.08] tracking-tight " +
        (isDark ? "text-white" : "text-[#07162c]")
      }>
        {tab.headline}
      </h1>
      <p
        className={
          "mb-10 text-pretty text-p leading-relaxed " +
          (isDark ? "text-white" : "text-[#334155]") + " " +
          (isCenter
            ? "mx-auto max-w-2xl"
            : isStorefrontCustom
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
            : isStorefrontCustom
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
      aria-labelledby="home-hero-heading"
      className={
        "relative isolate w-full overflow-hidden pb-24 lg:pb-32 transition-all duration-300 " +
        (activeId === "storefront" || activeId === "hms" ? "pt-20" : "pt-28")
      }
      style={sectionStyle}
    >
      <GridPulses color={active.pulseColor ?? active.accentText} />
      <div className={
        "relative z-10 w-full pb-4 transition-all duration-300 " +
        (activeId === "storefront" || activeId === "hms" ? "pt-10 lg:pt-16" : "pt-2")
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
    </section>
  );
}

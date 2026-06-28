"use client";

import type { CSSProperties } from "react";
import Link from "next/link";
import { motion, type Variants } from "framer-motion";
import { ArrowRight } from "lucide-react";
import WebsiteLayout from "@/components/website/WebsiteLayout";
import { SolutionsHotelDeepDive } from "@/components/website/SolutionsHotelDeepDive";
import { SOLUTIONS_HOTEL_HERO } from "@/constants/solutions-hotel";

/** Served from `public/videos/` — keep filename in sync with asset on disk */
const HOTEL_SOLUTIONS_HERO_WHEEL_GIF =
  "/videos/rotating_wheel_white_fixed-ezgif.com-crop.gif";

/** Wheel diameter only (decorative layer); hero copy no longer uses padded inset tied to this value */
const HOTEL_HERO_WHEEL_DIAMETER_CSS = "min(175vw, 135vh, 2800px)";

/** Grid backdrop — only visible at ≤800px (matches GIF / layout breakpoint). */
const HOTEL_HERO_GRID_STYLE: CSSProperties = {
  backgroundImage: `
      linear-gradient(to right, rgba(0, 13, 31, 0.05) 1px, transparent 1px),
      linear-gradient(to bottom, rgba(0, 13, 31, 0.05) 1px, transparent 1px)
    `,
  backgroundSize: "40px 40px",
};

const HOTEL_HERO_WHEEL_VARS_STYLE = {
  "--hotel-hero-wheel-d": HOTEL_HERO_WHEEL_DIAMETER_CSS,
} as CSSProperties;

const fadeUp: Variants = {
  offscreen: { opacity: 0, y: 36 },
  onscreen: {
    opacity: 1,
    y: 0,
    transition: { type: "spring", duration: 0.75, bounce: 0.18 },
  },
};

export default function SolutionsHotelPage() {
  return (
    <WebsiteLayout>
      <section
        className="relative isolate overflow-hidden border-b border-slate-100 bg-white pb-24 pt-32 md:flex md:min-h-[min(840px,98vh)] md:items-center md:pb-28 md:pt-32"
        style={HOTEL_HERO_WHEEL_VARS_STYLE}
      >
        <div
          className="pointer-events-none absolute inset-0 z-0 hidden max-[800px]:block"
          style={HOTEL_HERO_GRID_STYLE}
          aria-hidden
        />
        {/* Wheel: hidden at ≤800px; clipped at viewport edge when shown */}
        <div
          className="pointer-events-none absolute right-0 top-1/2 z-0 hidden shrink-0 -translate-y-1/2 translate-x-1/2 min-[801px]:block"
          style={{
            width: "var(--hotel-hero-wheel-d)",
            aspectRatio: "1",
          }}
          aria-hidden
        >
          <motion.img
            src={HOTEL_SOLUTIONS_HERO_WHEEL_GIF}
            alt=""
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.65, ease: "easeOut", delay: 0.06 }}
            className="h-full w-full select-none object-contain"
            width={2400}
            height={2400}
            decoding="async"
            draggable={false}
          />
        </div>

        <div className="relative z-10 mx-auto w-full max-w-7xl px-6 md:flex-1 md:min-w-0">
          <motion.div
            initial={{ opacity: 0, y: 28 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, ease: "easeOut" }}
            className="mx-auto w-full max-w-xl text-center min-[801px]:mx-0 min-[801px]:max-w-[75%] min-[801px]:text-left"
          >
            <p className="mb-4 text-[11px] font-bold uppercase tracking-[0.22em] text-xyvoo-blue">
              {SOLUTIONS_HOTEL_HERO.eyebrow}
            </p>
            <h1 className="mb-6 text-balance text-[clamp(2rem,5vw,3.25rem)] font-black leading-[1.12] text-xyvoo-navy">
              {SOLUTIONS_HOTEL_HERO.title}
            </h1>
            <p
              className="mx-auto mb-12 max-w-[540px] text-[17px] leading-relaxed min-[801px]:mx-0"
              style={{ color: "var(--xyvoo-navy-muted-text)" }}
            >
              {SOLUTIONS_HOTEL_HERO.subtitle}
            </p>
            <div className="flex flex-wrap items-center justify-center gap-4 min-[801px]:justify-start">
              <Link
                href="/register"
                className="inline-flex items-center gap-2 rounded-2xl px-8 py-4 text-base font-bold text-white shadow-lg transition-opacity hover:opacity-92"
                style={{ background: "var(--xyvoo-blue)" }}
              >
                Get started
                <ArrowRight className="h-4 w-4 shrink-0" />
              </Link>
              <Link
                href="/home/pricing"
                className="inline-flex items-center gap-2 rounded-2xl border-2 border-slate-200 bg-white px-8 py-4 text-base font-semibold text-xyvoo-navy transition-colors hover:border-slate-300 hover:bg-slate-50"
              >
                Pricing
              </Link>
            </div>
          </motion.div>
        </div>
      </section>

      <SolutionsHotelDeepDive />

      <section
        className="px-6 py-24 text-center"
        style={{ background: "var(--xyvoo-hms-pricing-hero-gradient)" }}
      >
        <motion.div
          initial="offscreen"
          whileInView="onscreen"
          viewport={{ once: true }}
          variants={fadeUp}
          className="mx-auto max-w-2xl"
        >
          <h2 className="mb-4 text-3xl font-black text-white md:text-4xl">
            Ready to run your property on XYVOO?
          </h2>
          <p className="mb-10 text-[17px]" style={{ color: "var(--xyvoo-white-muted-75)" }}>
            Start free or compare HMS plans — our team can help you migrate without downtime.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-4">
            <Link
              href="/register"
              className="inline-flex items-center gap-2 rounded-2xl bg-white px-8 py-4 text-base font-black text-xyvoo-blue shadow-lg transition-colors hover:bg-blue-50"
            >
              Get started
              <ArrowRight className="h-4 w-4 shrink-0" />
            </Link>
            <Link
              href="/home/contact"
              className="inline-flex items-center rounded-2xl border-2 px-8 py-4 text-base font-semibold text-white transition-colors hover:bg-white/[0.08]"
              style={{ borderColor: "rgb(255 255 255 / 0.35)" }}
            >
              Contact sales
            </Link>
          </div>
        </motion.div>
      </section>
    </WebsiteLayout>
  );
}

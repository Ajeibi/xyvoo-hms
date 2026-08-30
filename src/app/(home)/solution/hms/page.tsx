"use client";

import type { CSSProperties } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { HotelOpsWheel } from "@/components/website/HotelOpsWheel";
import { SolutionsHotelDeepDive } from "@/components/website/SolutionsHotelDeepDive";
import { SOLUTIONS_HOTEL_HERO } from "@/constants/solutions-hotel";

/** Grid backdrop — transparent white grid lines for dark background */
const HOTEL_HERO_GRID_STYLE: CSSProperties = {
  backgroundImage: `
      linear-gradient(to right, rgba(255, 255, 255, 0.015) 1px, transparent 1px),
      linear-gradient(to bottom, rgba(255, 255, 255, 0.015) 1px, transparent 1px)
    `,
  backgroundSize: "40px 40px",
};

export default function SolutionsHotelPage() {
  return (
    <>
      <section
        className="relative isolate overflow-hidden border-b border-white/5 bg-[#000d1f] pb-24 pt-32 md:flex md:min-h-[min(840px,98vh)] md:items-center md:pb-28 md:pt-32"
      >
        <div
          className="pointer-events-none absolute inset-0 z-0"
          style={HOTEL_HERO_GRID_STYLE}
          aria-hidden
        />

        <div className="relative z-10 mx-auto w-full max-w-[1380px] px-6 grid grid-cols-1 min-[801px]:grid-cols-2 gap-12 items-center">
          <motion.div
            initial={{ opacity: 0, y: 28 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, ease: "easeOut" }}
            className="mx-auto w-full max-w-xl text-center min-[801px]:mx-0 min-[801px]:max-w-full min-[801px]:text-left"
          >
            <p className="mb-4 text-[11px] font-bold uppercase tracking-[0.22em] text-[#90caf9]">
              {SOLUTIONS_HOTEL_HERO.eyebrow}
            </p>
            <h1 className="mb-6 text-balance text-[clamp(2rem,5vw,3.25rem)] font-black leading-[1.12] text-white">
              {SOLUTIONS_HOTEL_HERO.title}
            </h1>
            <p
              className="mx-auto mb-12 max-w-[540px] text-[17px] leading-relaxed min-[801px]:mx-0"
              style={{ color: "var(--xyvoo-white-muted-75)" }}
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
                href="/pricing"
                className="inline-flex items-center gap-2 rounded-2xl border-2 border-white/20 bg-white/5 px-8 py-4 text-base font-semibold text-white transition-colors hover:border-white/30 hover:bg-white/10"
              >
                Pricing
              </Link>
            </div>
          </motion.div>

          {/* Interactive hotel-ops wheel: below the text on mobile, 50% width beside it on desktop */}
          <div className="flex justify-center items-center w-full">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.65, ease: "easeOut", delay: 0.06 }}
              className="w-full max-w-[420px] aspect-square min-[801px]:max-w-[650px]"
            >
              <HotelOpsWheel />
            </motion.div>
          </div>
        </div>
      </section>

      <SolutionsHotelDeepDive />
    </>
  );
}

"use client";

import type { CSSProperties } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { SolutionsStorefrontDeepDive } from "@/components/website/SolutionsStorefrontDeepDive";
import { SOLUTIONS_STOREFRONT_HERO } from "@/constants/solutions-storefront";

/** Grid backdrop — transparent white grid lines for dark background */
const STOREFRONT_HERO_GRID_STYLE: CSSProperties = {
  backgroundImage: `
      linear-gradient(to right, rgba(255, 255, 255, 0.015) 1px, transparent 1px),
      linear-gradient(to bottom, rgba(255, 255, 255, 0.015) 1px, transparent 1px)
    `,
  backgroundSize: "40px 40px",
};

/** The 4 modules that immediately follow in SolutionsStorefrontDeepDive's
 * full-width sticky-stack treatment (see STICKY_STACK_COUNT there) —
 * this row previews exactly those, in the same order. */
const HERO_HIGHLIGHTS = [
  { label: "Storefront", sub: "live in minutes" },
  { label: "Catalog", sub: "real-time stock" },
  { label: "Orders", sub: "checkout to delivery" },
  { label: "Payments", sub: "Paystack-ready" },
];

export default function SolutionsStorefrontPage() {
  return (
    <>
      <section className="relative isolate overflow-hidden border-b border-white/5 bg-[#04140f] pb-20 pt-32 md:pb-24 md:pt-36">
        <div
          className="pointer-events-none absolute inset-0 z-0"
          style={STOREFRONT_HERO_GRID_STYLE}
          aria-hidden
        />
        {/* Two off-centre glow blobs, not one centred glow — mirrors the
            asymmetric two-blob technique already used behind the HMS ops
            wheel and the storefront features glow elsewhere on the site. */}
        <div
          className="pointer-events-none absolute -top-16 right-[8%] z-0 h-[420px] w-[420px] rounded-full blur-[110px]"
          style={{ background: "rgb(var(--xyvoo-teal-product-rgb, 77 208 196) / 0.28)" }}
          aria-hidden
        />
        <div
          className="pointer-events-none absolute bottom-[-80px] left-[18%] z-0 h-[280px] w-[280px] rounded-full blur-[90px]"
          style={{ background: "rgb(var(--xyvoo-mint-rgb) / 0.16)" }}
          aria-hidden
        />

        <motion.div
          initial={{ opacity: 0, y: 28 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, ease: "easeOut" }}
          className="relative z-10 mx-auto w-full max-w-[1200px] px-6"
        >
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-6">
            <p
              className="text-[11px] font-bold uppercase tracking-[0.22em]"
              style={{ color: "var(--xyvoo-teal-product)" }}
            >
              {SOLUTIONS_STOREFRONT_HERO.eyebrow}
            </p>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/45">
              No credit card required
            </p>
          </div>

          <h1 className="mt-10 max-w-4xl text-balance text-[clamp(2.5rem,6vw,4.25rem)] font-black leading-[1.08] text-white">
            One <span style={{ color: "var(--xyvoo-teal-product)" }}>connected</span> operating
            system for your online business.
          </h1>

          <div className="mt-8 flex flex-col gap-8 md:flex-row md:items-end md:justify-between">
            <p className="max-w-xl text-[17px] leading-relaxed text-white/70">
              {SOLUTIONS_STOREFRONT_HERO.subtitle}
            </p>
            <div className="flex flex-wrap items-center gap-4 shrink-0">
              <Link
                href="/register/storefront"
                className="inline-flex items-center gap-2 rounded-2xl px-8 py-4 text-base font-bold text-white shadow-lg transition-opacity hover:opacity-92"
                style={{ background: "var(--xyvoo-teal-product-hover)" }}
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
          </div>

          <div className="mt-16 grid grid-cols-2 gap-x-6 gap-y-8 border-t border-white/10 pt-10 sm:grid-cols-4">
            {HERO_HIGHLIGHTS.map((h) => (
              <div key={h.label}>
                <p className="text-lg font-bold text-white">{h.label}</p>
                <p className="mt-1 text-sm text-white/45">{h.sub}</p>
              </div>
            ))}
          </div>
        </motion.div>
      </section>

      <SolutionsStorefrontDeepDive />
    </>
  );
}

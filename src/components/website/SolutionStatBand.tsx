"use client";

import { useRef, type CSSProperties } from "react";
import { motion, useInView } from "framer-motion";

export type SolutionStatBandItem = {
  headline: string;
  label: string;
};

const GRID_STYLE: CSSProperties = {
  backgroundImage: `
      linear-gradient(to right, rgba(255, 255, 255, 0.02) 1px, transparent 1px),
      linear-gradient(to bottom, rgba(255, 255, 255, 0.02) 1px, transparent 1px)
    `,
  backgroundSize: "40px 40px",
};

/** A dark, full-bleed band of bold qualitative callouts — each one tilts
 * and lifts into place with a spring, and its accent underline draws in
 * left-to-right once it's in view. Deliberately not numeric fake-usage
 * stats — each item is a short claim about how the system works, not a
 * fabricated metric. */
export function SolutionStatBand({
  eyebrow,
  title,
  items,
  bgColor,
  accentRgb,
}: {
  eyebrow: string;
  title: string;
  items: SolutionStatBandItem[];
  bgColor: string;
  accentRgb: string;
}) {
  const headingRef = useRef<HTMLDivElement>(null);
  const headingInView = useInView(headingRef, { once: true, margin: "-80px" });

  return (
    <section className="relative isolate overflow-hidden px-6 py-16 md:py-20" style={{ background: bgColor }}>
      <div className="pointer-events-none absolute inset-0 z-0" style={GRID_STYLE} aria-hidden />
      <div
        className="pointer-events-none absolute -left-24 top-1/2 z-0 h-[380px] w-[380px] -translate-y-1/2 rounded-full blur-[130px]"
        style={{ background: `rgb(${accentRgb} / 0.16)` }}
        aria-hidden
      />

      <div className="relative z-10 mx-auto max-w-[1200px]">
        <div ref={headingRef}>
          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={headingInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.5 }}
            className="mb-3 text-eyebrow font-bold uppercase tracking-[0.22em]"
            style={{ color: `rgb(${accentRgb})` }}
          >
            {eyebrow}
          </motion.p>
          <motion.h3
            initial={{ opacity: 0, y: 18 }}
            animate={headingInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.6, delay: 0.05 }}
            className="mb-12 max-w-xl text-h3 font-black text-white md:mb-14"
          >
            {title}
          </motion.h3>
        </div>

        <div className="grid grid-cols-1 gap-10 md:grid-cols-3 md:gap-8" style={{ perspective: "1200px" }}>
          {items.map((item, i) => (
            <StatCard key={item.label} item={item} accentRgb={accentRgb} delay={i * 0.12} />
          ))}
        </div>
      </div>
    </section>
  );
}

function StatCard({ item, accentRgb, delay }: { item: SolutionStatBandItem; accentRgb: string; delay: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-60px" });

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 28, rotateX: 12 }}
      animate={inView ? { opacity: 1, y: 0, rotateX: 0 } : {}}
      transition={{ duration: 0.65, delay, ease: [0.22, 1, 0.36, 1] }}
      style={{ transformOrigin: "top center" }}
    >
      <div className="relative pt-6">
        <span className="absolute left-0 top-0 block h-px w-full overflow-hidden bg-white/10">
          <motion.span
            className="absolute inset-y-0 left-0 block h-full"
            style={{ background: `rgb(${accentRgb})` }}
            initial={{ width: "0%" }}
            animate={inView ? { width: "100%" } : {}}
            transition={{ duration: 0.7, delay: delay + 0.2, ease: "easeOut" }}
          />
        </span>
        <p className="text-h3 font-black leading-tight" style={{ color: `rgb(${accentRgb})` }}>
          {item.headline}
        </p>
        <p className="mt-2 text-p leading-relaxed text-white/60">{item.label}</p>
      </div>
    </motion.div>
  );
}

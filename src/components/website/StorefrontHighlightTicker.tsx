"use client";

import { useRef } from "react";
import { motion, useInView } from "framer-motion";

export type StorefrontHighlightTickerItem = {
  headline: string;
  label: string;
};

/** A plain, static row of callouts — no scrolling marquee, no glow, no
 * tilt. Modelled on a plainer reference (a clean three-column feature row:
 * bold subhead, one-line description, a thin top rule, nothing else) after
 * the original auto-scrolling ticker version read as too busy. Restraint is
 * the point here, not motion. */
export function StorefrontHighlightTicker({
  eyebrow,
  title,
  items,
  accentRgb,
}: {
  eyebrow: string;
  title: string;
  items: StorefrontHighlightTickerItem[];
  accentRgb: string;
}) {
  const headingRef = useRef<HTMLDivElement>(null);
  const headingInView = useInView(headingRef, { once: true, margin: "-60px" });

  return (
    <section className="bg-white px-6 py-16 md:py-24">
      <div className="mx-auto max-w-[1200px]">
        <div ref={headingRef} className="mb-14 max-w-xl md:mb-16">
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
            initial={{ opacity: 0, y: 16 }}
            animate={headingInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.55, delay: 0.05 }}
            className="text-h3 font-black text-xyvoo-navy"
          >
            {title}
          </motion.h3>
        </div>

        <div className="grid grid-cols-1 gap-10 sm:grid-cols-3 sm:gap-8">
          {items.map((item, i) => (
            <Callout key={item.label} item={item} accentRgb={accentRgb} delay={i * 0.08} />
          ))}
        </div>
      </div>
    </section>
  );
}

function Callout({ item, accentRgb, delay }: { item: StorefrontHighlightTickerItem; accentRgb: string; delay: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-60px" });

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 16 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.5, delay }}
      className="border-t-2 pt-5"
      style={{ borderColor: `rgb(${accentRgb} / 0.3)` }}
    >
      <p className="text-h5 font-bold text-xyvoo-navy">{item.headline}</p>
      <p className="mt-2 text-p leading-relaxed text-xyvoo-navy/60">{item.label}</p>
    </motion.div>
  );
}

"use client";

import { useRef } from "react";
import { motion, useInView } from "framer-motion";

export type StorefrontFeatureShelfItem = {
  title: string;
  description: string;
};

function FeatureRow({ item, index, accentRgb }: { item: StorefrontFeatureShelfItem; index: number; accentRgb: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-60px" });

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 20 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.5, delay: (index % 8) * 0.05, ease: [0.22, 1, 0.36, 1] }}
      className="group relative grid grid-cols-1 gap-2 border-t border-slate-100 py-7 pl-5 -ml-5 first:border-t-0 first:pt-0 first:pl-5 sm:grid-cols-[minmax(0,280px)_1fr] sm:gap-8"
      style={{ ["--hover-color" as string]: `rgb(${accentRgb})` }}
    >
      <motion.span
        className="pointer-events-none absolute left-0 top-7 h-6 w-[3px] origin-top rounded-full group-first:top-0"
        style={{ background: `rgb(${accentRgb})` }}
        initial={{ scaleY: 0 }}
        whileHover={{ scaleY: 1 }}
        animate={{ scaleY: 0 }}
        transition={{ duration: 0.25, ease: "easeOut" }}
        aria-hidden
      />
      <div className="flex items-start gap-3">
        <motion.span
          whileHover={{ scale: 1.15 }}
          transition={{ type: "spring", stiffness: 400, damping: 12 }}
          className="font-mono text-sm font-semibold transition-colors duration-300 group-hover:[color:var(--hover-color)]"
          style={{ color: `rgb(${accentRgb})` }}
        >
          {String(index + 1).padStart(2, "0")}
        </motion.span>
        <h5 className="text-h5 font-bold text-xyvoo-navy transition-colors duration-300 group-hover:[color:var(--hover-color)]">
          {item.title}
        </h5>
      </div>
      <p className="text-p leading-relaxed text-xyvoo-navy/60">{item.description}</p>
    </motion.div>
  );
}

/** A plain divided list rather than a grid of cards — for a feature set
 * this long (7-8 items), a wall of equal-weight boxes reads as repetitive;
 * a single column of number/title/description rows, separated by thin
 * rules, stays scannable without the visual weight of a card each. Built
 * for Storefront pages specifically so they read differently from HMS's
 * pinned-scroll showcase rather than sharing the same component with a
 * different accent colour. */
export function StorefrontFeatureShelf({
  headingId,
  eyebrow,
  title,
  intro,
  items,
  accentRgb,
}: {
  headingId: string;
  eyebrow: string;
  title: string;
  intro: string;
  items: StorefrontFeatureShelfItem[];
  accentRgb: string;
}) {
  const headingRef = useRef<HTMLDivElement>(null);
  const headingInView = useInView(headingRef, { once: true, margin: "-60px" });

  return (
    <section className="bg-white px-6 py-16 md:py-24" aria-labelledby={headingId}>
      <div className="mx-auto max-w-[900px]">
        <div ref={headingRef} className="mb-14 text-center md:mb-16">
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
            id={headingId}
            initial={{ opacity: 0, y: 16 }}
            animate={headingInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.55, delay: 0.05 }}
            className="text-h3 font-black text-xyvoo-navy"
          >
            {title}
          </motion.h3>
          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={headingInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.55, delay: 0.1 }}
            className="mx-auto mt-4 max-w-lg text-p leading-relaxed text-xyvoo-navy/60"
          >
            {intro}
          </motion.p>
        </div>

        <div>
          {items.map((item, i) => (
            <FeatureRow key={item.title} item={item} index={i} accentRgb={accentRgb} />
          ))}
        </div>
      </div>
    </section>
  );
}

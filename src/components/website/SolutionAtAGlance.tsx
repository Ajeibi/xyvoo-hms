"use client";

import { useRef } from "react";
import { motion, useInView } from "framer-motion";

export type SolutionGlanceStat = {
  label: string;
  value: string;
};

/** "At a glance" strip — an eyebrow beside a row of label/value stats plus a
 * keyword tag cloud, sitting on the page's ordinary white/slate background
 * (not the hero) right below it. Colour accent comes from the calling page
 * (HMS blue vs Storefront teal); the layout itself is generic so both
 * product landing components can share it. */
export function SolutionAtAGlance({
  accentRgb,
  stats,
  tagsLabel,
  tags,
}: {
  accentRgb: string;
  stats: SolutionGlanceStat[];
  tagsLabel: string;
  tags: string[];
}) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-50px" });

  return (
    <section className="bg-slate-50 px-6 py-14 md:py-16">
      <motion.div
        ref={ref}
        initial={{ opacity: 0, y: 24 }}
        animate={inView ? { opacity: 1, y: 0 } : {}}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="mx-auto max-w-[1200px]"
      >
        <div className="flex flex-col gap-10 md:flex-row md:gap-16">
          <div className="shrink-0 md:w-[220px]">
            <span className="text-eyebrow font-bold uppercase tracking-[0.22em]" style={{ color: `rgb(${accentRgb})` }}>
              At a Glance
            </span>
          </div>

          <div className="grid flex-1 grid-cols-1 gap-x-10 gap-y-8 sm:grid-cols-3">
            {stats.map((stat) => (
              <div key={stat.label} className="border-t border-slate-200 pt-4">
                <p className="text-xs font-bold uppercase tracking-wider text-xyvoo-navy/40">{stat.label}</p>
                <p className="mt-2 text-lg font-bold text-xyvoo-navy">{stat.value}</p>
              </div>
            ))}

            <div className="col-span-full border-t border-slate-200 pt-4">
              <p className="text-xs font-bold uppercase tracking-wider text-xyvoo-navy/40">{tagsLabel}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {tags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full border bg-white px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-xyvoo-navy/70"
                    style={{ borderColor: `rgb(${accentRgb} / 0.3)` }}
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    </section>
  );
}

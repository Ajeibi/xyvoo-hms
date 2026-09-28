"use client";

import { useRef } from "react";
import { motion, useInView } from "framer-motion";
import type { FadeInSectionProps } from "@/types";

export type SolutionListItem = {
  title: string;
  description: string;
};

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

/** Sticky-left heading beside a numbered list that scrolls past it — the
 * "Integrations" pattern already used on both main solution pages (the
 * aienai.co "How We Work" pattern), generalized with an accent colour and
 * arbitrary title/intro/items so it can be reused for any list, not just
 * integrations. */
export function SolutionIntegrationsList({
  headingId,
  title,
  intro,
  items,
  accentRgb,
}: {
  headingId: string;
  title: string;
  intro: string;
  items: SolutionListItem[];
  accentRgb: string;
}) {
  return (
    <section className="border-t border-slate-100 bg-white px-6 py-16 md:py-24" aria-labelledby={headingId}>
      <div className="mx-auto grid max-w-[1200px] grid-cols-1 gap-12 lg:grid-cols-2 lg:gap-16 lg:items-start">
        <div className="lg:sticky lg:top-28">
          <FadeIn>
            <div>
              <h3 id={headingId} className="mb-3 text-h3 font-extrabold text-xyvoo-navy">
                {title}
              </h3>
              <p className="max-w-[42ch] text-p leading-relaxed text-xyvoo-navy/50">{intro}</p>
            </div>
          </FadeIn>
        </div>

        <ul className="flex flex-col">
          {items.map((item, i) => (
            <li
              key={item.title}
              className="group border-t border-slate-100 py-8 first:border-t-0 last:pb-0 lg:py-10 lg:last:pb-0"
              style={{ ["--hover-color" as string]: `rgb(${accentRgb})` }}
            >
              <span className="mb-2 block font-mono text-sm font-semibold tracking-wide text-xyvoo-navy/30 transition-colors duration-300 group-hover:[color:var(--hover-color)]">
                {String(i + 1).padStart(2, "0")}
              </span>
              <h5 className="text-h5 font-semibold leading-snug text-xyvoo-navy transition-colors duration-300 group-hover:[color:var(--hover-color)]">
                {item.title}
              </h5>
              <p className="mt-2 max-w-[46ch] text-p leading-relaxed text-xyvoo-navy/50">{item.description}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

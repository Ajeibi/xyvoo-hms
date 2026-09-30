"use client";

import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowUpRight } from "lucide-react";

export type DarkSplitHeroLink = {
  title: string;
  description: string;
  actionLabel: string;
  href: string;
};

const DARK_GRID_STYLE: CSSProperties = {
  backgroundImage: `
      linear-gradient(to right, rgba(255, 255, 255, 0.015) 1px, transparent 1px),
      linear-gradient(to bottom, rgba(255, 255, 255, 0.015) 1px, transparent 1px)
    `,
  backgroundSize: "40px 40px",
};

/** Navy hero with copy on the left and a list of related links on the right —
 * the same dense split layout as /support, /solution/hms and the business-type
 * pages. `children` renders under the subtitle (e.g. a search box). */
export function DarkSplitHero({
  eyebrow,
  title,
  titleId,
  subtitle,
  links,
  children,
}: {
  eyebrow: string;
  title: string;
  titleId?: string;
  subtitle: string;
  links: DarkSplitHeroLink[];
  children?: ReactNode;
}) {
  return (
    <section className="relative isolate overflow-hidden border-b border-white/5 bg-[#000d1f] px-6 pt-36 pb-20 md:pb-24">
      <div className="pointer-events-none absolute inset-0 z-0" style={DARK_GRID_STYLE} aria-hidden />
      <div
        className="pointer-events-none absolute -top-16 right-[8%] z-0 h-[360px] w-[360px] rounded-full blur-[100px]"
        style={{ background: "rgb(var(--xyvoo-blue-rgb) / 0.24)" }}
        aria-hidden
      />

      <div className="relative z-10 mx-auto grid max-w-[1200px] grid-cols-1 gap-14 lg:grid-cols-[1.15fr_0.85fr] lg:items-center">
        <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.55, ease: "easeOut" }}>
          <p className="mb-5 text-eyebrow font-bold uppercase tracking-[0.22em] text-[#90caf9]">{eyebrow}</p>
          <h1 id={titleId} className="text-balance text-h1 font-black leading-[1.08] tracking-tight text-white">
            {title}
          </h1>
          <p className="mt-6 max-w-md text-p leading-relaxed text-white/60">{subtitle}</p>
          {children}
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, delay: 0.1, ease: "easeOut" }}
          className="border-t border-white/10"
        >
          {links.map((link) => (
            <Link key={link.title} href={link.href} className="group block border-b border-white/10 py-7 first:pt-0">
              <div className="flex items-baseline justify-between gap-4">
                <h2 className="text-lg font-bold text-white">{link.title}</h2>
                <span className="inline-flex shrink-0 items-center gap-1 text-xs font-bold uppercase tracking-wider text-[#90caf9] transition-colors group-hover:text-white">
                  {link.actionLabel}
                  <ArrowUpRight className="h-3 w-3" />
                </span>
              </div>
              <p className="mt-2 max-w-sm text-sm leading-relaxed text-white/50">{link.description}</p>
            </Link>
          ))}
        </motion.div>
      </div>
    </section>
  );
}

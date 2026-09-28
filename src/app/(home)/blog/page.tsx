"use client";

import { useMemo, useRef, useState, type CSSProperties } from "react";
import Link from "next/link";
import { motion, useInView } from "framer-motion";
import { ArrowRight, Clock } from "lucide-react";
import type { FadeInSectionProps } from "@/types";
import { BLOG_POSTS } from "@/constants/blog";

/** Same static grid backdrop used on /solution/hms, /support, /pricing and the business-type pages' hero. */
const DARK_GRID_STYLE: CSSProperties = {
  backgroundImage: `
      linear-gradient(to right, rgba(255, 255, 255, 0.015) 1px, transparent 1px),
      linear-gradient(to bottom, rgba(255, 255, 255, 0.015) 1px, transparent 1px)
    `,
  backgroundSize: "40px 40px",
};

function FadeIn({ children, delay = 0 }: FadeInSectionProps) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-60px" });
  return (
    <motion.div ref={ref} initial={{ opacity: 0, y: 30 }} animate={inView ? { opacity: 1, y: 0 } : {}} transition={{ duration: 0.6, delay }}>
      {children}
    </motion.div>
  );
}

const CATEGORIES = ["All", "Operations", "Revenue", "Guest Experience", "Finance", "Technology"];

export default function BlogPage() {
  const [category, setCategory] = useState("All");
  const featured = BLOG_POSTS.find((p) => p.featured) ?? BLOG_POSTS[0];
  const rest = useMemo(
    () =>
      BLOG_POSTS.filter((p) => p.slug !== featured.slug).filter(
        (p) => category === "All" || p.category === category
      ),
    [category, featured.slug]
  );

  return (
    <>
      <section className="relative isolate overflow-hidden border-b border-white/5 bg-[#000d1f] px-6 pt-36 pb-16 text-center">
        <div className="pointer-events-none absolute inset-0 z-0" style={DARK_GRID_STYLE} aria-hidden />
        <div
          className="pointer-events-none absolute -top-16 left-1/2 z-0 h-[360px] w-[360px] -translate-x-1/2 rounded-full blur-[100px]"
          style={{ background: "rgb(var(--xyvoo-blue-rgb) / 0.24)" }}
          aria-hidden
        />
        <div className="relative z-10 mx-auto max-w-2xl">
          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="mb-4 text-eyebrow font-bold uppercase tracking-[0.22em] text-[#90caf9]"
          >
            Insights & Resources
          </motion.p>
          <motion.h1
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.05 }}
            className="mb-6 text-balance text-h1 font-black leading-[1.08] tracking-tight text-white"
          >
            The XYVOO Blog
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.12 }}
            className="mx-auto max-w-lg text-p leading-relaxed text-white/60"
          >
            Practical guides, data-driven insights, and hotel management ideas from the XYVOO team.
          </motion.p>
        </div>
      </section>
      <section className="py-16 bg-white">
        <div className="max-w-7xl mx-auto px-6">
          <FadeIn>
            <div className="mb-12 flex flex-wrap gap-2">
              {CATEGORIES.map((c) => (
                <button
                  type="button"
                  key={c}
                  onClick={() => setCategory(c)}
                  className={`rounded-full px-4 py-2 text-sm font-medium transition-all ${
                    c === category
                      ? "bg-xyvoo-blue text-white"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          </FadeIn>
          <FadeIn>
            <Link href={`/blog/${featured.slug}`} className="block">
              <motion.div
                whileHover={{ y: -3 }}
                transition={{ duration: 0.2 }}
                className="group relative mb-10 cursor-pointer overflow-hidden rounded-3xl bg-xyvoo-navy p-10 text-white"
              >
                <div className="absolute -top-10 -right-10 w-48 h-48 bg-white/5 rounded-full" />
                <div className="relative">
                  <div className="flex items-center gap-3 mb-5">
                    <span
                      className="rounded-full px-3 py-1 text-xs font-semibold text-xyvoo-mint"
                      style={{
                        background: "var(--xyvoo-blue-glass-20)",
                        border: "1px solid var(--xyvoo-blue-glass-30)",
                      }}
                    >
                      {featured.category}
                    </span>
                    <span className="text-xs text-slate-400 flex items-center gap-1"><Clock className="w-3 h-3" /> {featured.readTime} read</span>
                    <span className="text-xs text-slate-400">{featured.date}</span>
                  </div>
                  <h2 className="text-3xl font-black mb-4 max-w-2xl group-hover:text-blue-300 transition-colors">{featured.title}</h2>
                  <p className="text-slate-300 max-w-2xl mb-6 leading-relaxed">{featured.excerpt}</p>
                  <span className="inline-flex items-center gap-2 font-semibold text-xyvoo-mint transition-all hover:gap-3">
                    Read Article <ArrowRight className="h-4 w-4" />
                  </span>
                </div>
              </motion.div>
            </Link>
          </FadeIn>
          {rest.length === 0 ? (
            <FadeIn>
              <p className="py-16 text-center text-p text-xyvoo-navy/50">No articles in this category yet.</p>
            </FadeIn>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {rest.map(({ slug, title, excerpt, category: postCategory, readTime, date, color }, i) => (
                <FadeIn key={slug} delay={i * 0.1}>
                  <Link href={`/blog/${slug}`} className="block h-full">
                    <motion.div whileHover={{ y: -4 }} transition={{ duration: 0.2 }} className="group flex h-full flex-col bg-white border border-slate-200 rounded-2xl overflow-hidden hover:shadow-xl transition-all cursor-pointer">
                      <div className={`h-36 bg-gradient-to-br ${color} flex items-end p-5`}>
                        <span className="px-2.5 py-1 bg-white/20 text-white text-xs font-semibold rounded-full">{postCategory}</span>
                      </div>
                      <div className="flex flex-1 flex-col p-6">
                        <div className="flex items-center gap-3 text-xs text-slate-400 mb-3">
                          <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {readTime}</span>
                          <span>{date}</span>
                        </div>
                        <h3 className="font-bold text-slate-900 mb-2 transition-colors leading-snug">{title}</h3>
                        <p className="text-sm text-slate-500 leading-relaxed mb-4 line-clamp-2 flex-1">{excerpt}</p>
                        <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-xyvoo-blue">
                          Read more <ArrowRight className="h-3.5 w-3.5" />
                        </span>
                      </div>
                    </motion.div>
                  </Link>
                </FadeIn>
              ))}
            </div>
          )}
        </div>
      </section>
    </>
  );
}

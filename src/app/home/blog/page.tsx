"use client";

import { useRef } from "react";
import { motion, useInView } from "framer-motion";
import WebsiteLayout from "@/components/website/WebsiteLayout";
import { ArrowRight, Clock } from "lucide-react";
import type { FadeInSectionProps } from "@/types";

function FadeIn({ children, delay = 0 }: FadeInSectionProps) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-60px" });
  return (
    <motion.div ref={ref} initial={{ opacity: 0, y: 30 }} animate={inView ? { opacity: 1, y: 0 } : {}} transition={{ duration: 0.6, delay }}>
      {children}
    </motion.div>
  );
}

const POSTS = [
  { slug: "1", title: "How Nigerian Hotels Are Cutting Check-in Time by 80%", excerpt: "We analysed data from 200 hotels using XYVOO and found one common thread in the highest-performing properties.", category: "Operations", readTime: "5 min", date: "Apr 8, 2026", featured: true, color: "from-indigo-500 to-violet-600" },
  { slug: "2", title: "The Hotelier's Guide to Revenue Management in 2026", excerpt: "ADR, RevPAR, occupancy rate — what they mean, how to improve them, and why every independent hotel should be tracking them.", category: "Revenue", readTime: "8 min", date: "Apr 5, 2026", featured: false, color: "from-emerald-500 to-teal-600" },
  { slug: "3", title: "Why Your Front Desk Software is Costing You Repeat Guests", excerpt: "The link between slow check-in systems and lower guest retention is more direct than most hoteliers realise.", category: "Guest Experience", readTime: "4 min", date: "Apr 1, 2026", featured: false, color: "from-amber-500 to-orange-600" },
  { slug: "4", title: "Paystack for Hotels: A Complete Integration Guide", excerpt: "Everything you need to know about accepting card payments, managing refunds, and reconciling hotel transactions.", category: "Finance", readTime: "10 min", date: "Mar 28, 2026", featured: false, color: "from-pink-500 to-rose-600" },
  { slug: "5", title: "Housekeeping Efficiency: The Digital Transformation Most Hotels Miss", excerpt: "Paper-based housekeeping logs are killing your room turnaround time. Here's how top hotels have fixed it.", category: "Operations", readTime: "6 min", date: "Mar 22, 2026", featured: false, color: "from-sky-500 to-blue-600" },
  { slug: "6", title: "Building a Loyalty Programme That Actually Works for African Guests", excerpt: "Loyalty doesn't have to mean airline miles. We break down what genuinely drives repeat bookings in African hospitality.", category: "Guest Experience", readTime: "7 min", date: "Mar 18, 2026", featured: false, color: "from-violet-500 to-purple-600" },
];

const CATEGORIES = ["All", "Operations", "Revenue", "Guest Experience", "Finance", "Technology"];

export default function BlogPage() {
  const featured = POSTS[0];
  const rest = POSTS.slice(1);
  return (
    <WebsiteLayout>
      <section className="pt-32 pb-16 bg-white border-b border-slate-100">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5 }}
            className="mb-4 text-xs font-bold uppercase tracking-widest text-xyvoo-blue"
          >
            Insights & Resources
          </motion.p>
          <motion.h1
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7 }}
            className="mb-6 text-5xl font-black text-xyvoo-navy md:text-6xl"
          >
            The XYVOO Blog
          </motion.h1>
          <motion.p initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.2 }} className="text-lg text-slate-500 max-w-xl mx-auto">
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
                  className={`rounded-full px-4 py-2 text-sm font-medium transition-all ${
                    c === "All"
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
          </FadeIn>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {rest.map(({ slug, title, excerpt, category, readTime, date, color }, i) => (
              <FadeIn key={slug} delay={i * 0.1}>
                <motion.div whileHover={{ y: -4 }} transition={{ duration: 0.2 }} className="group bg-white border border-slate-200 rounded-2xl overflow-hidden hover:shadow-xl transition-all cursor-pointer">
                  <div className={`h-36 bg-gradient-to-br ${color} flex items-end p-5`}>
                    <span className="px-2.5 py-1 bg-white/20 text-white text-xs font-semibold rounded-full">{category}</span>
                  </div>
                  <div className="p-6">
                    <div className="flex items-center gap-3 text-xs text-slate-400 mb-3">
                      <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {readTime}</span>
                      <span>{date}</span>
                    </div>
                    <h3 className="font-bold text-slate-900 mb-2 transition-colors leading-snug">{title}</h3>
                    <p className="text-sm text-slate-500 leading-relaxed mb-4 line-clamp-2">{excerpt}</p>
                    <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-xyvoo-blue">
                      Read more <ArrowRight className="h-3.5 w-3.5" />
                    </span>
                  </div>
                </motion.div>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>
    </WebsiteLayout>
  );
}

"use client";

import { useMemo, useRef, useState, type CSSProperties } from "react";
import { motion, AnimatePresence, useInView, type Variants } from "framer-motion";
import {
  MessageCircle,
  ChevronDown,
  Search,
  ArrowUpRight,
  Info,
  BedDouble,
  ShoppingBag,
  CreditCard,
  Rocket,
  ShieldCheck,
  Users,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { XYVOO_FAQS } from "@/constants/faqs";

/** Same static grid backdrop used on /solution/hms and the business-type pages' hero. */
const DARK_GRID_STYLE: CSSProperties = {
  backgroundImage: `
      linear-gradient(to right, rgba(255, 255, 255, 0.015) 1px, transparent 1px),
      linear-gradient(to bottom, rgba(255, 255, 255, 0.015) 1px, transparent 1px)
    `,
  backgroundSize: "40px 40px",
};

const fadeUp: Variants = {
  offscreen: { opacity: 0, y: 32 },
  onscreen: { opacity: 1, y: 0, transition: { duration: 0.65, ease: "easeOut" } },
};

const CATEGORY_ICONS: Record<string, LucideIcon> = {
  "General / About XYVOO": Info,
  "Hotel Management System (HMS)": BedDouble,
  "XYVOO Storefront": ShoppingBag,
  "Pricing & Billing": CreditCard,
  "Onboarding & Setup": Rocket,
  "Security & Data Privacy": ShieldCheck,
  "Support & Account Management": Users,
};

const CATEGORY_NAMES = Array.from(new Set(XYVOO_FAQS.map((f) => f.category)));
const CATEGORIES = ["All", ...CATEGORY_NAMES];
const CATEGORY_COUNTS: Record<string, number> = CATEGORY_NAMES.reduce(
  (acc, cat) => ({ ...acc, [cat]: XYVOO_FAQS.filter((f) => f.category === cat).length }),
  {}
);

const CHANNELS = [
  {
    label: "WhatsApp",
    desc: "Fastest response — usually within minutes.",
    action: "Chat",
    href: "https://wa.me/",
  },
  {
    label: "Email",
    desc: "Outline your situation, we'll reply within a day.",
    action: "Email us",
    href: "mailto:hello@getxyvoo.com",
  },
  {
    label: "Talk to Sales",
    desc: "Have a question before you sign up?",
    action: "Contact",
    href: "/contact",
  },
];

function CategoryTile({
  category,
  count,
  onSelect,
  index,
}: {
  category: string;
  count: number;
  onSelect: (category: string) => void;
  index: number;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const inView = useInView(ref, { once: true, margin: "-60px" });
  const Icon = CATEGORY_ICONS[category] ?? Info;

  return (
    <motion.button
      ref={ref}
      type="button"
      onClick={() => onSelect(category)}
      initial={{ opacity: 0, y: 20 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.5, delay: (index % 7) * 0.06, ease: [0.22, 1, 0.36, 1] }}
      whileHover={{ y: -4 }}
      className="group flex items-start gap-4 rounded-2xl border border-slate-200 bg-white p-5 text-left transition-shadow hover:shadow-lg"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-xyvoo-blue/10 text-xyvoo-blue transition-colors group-hover:bg-xyvoo-blue group-hover:text-white">
        <Icon className="h-4.5 w-4.5" />
      </span>
      <span>
        <span className="block text-sm font-bold leading-snug text-xyvoo-navy">{category}</span>
        <span className="mt-0.5 block text-xs text-xyvoo-navy/45">{count} questions</span>
      </span>
    </motion.button>
  );
}

export default function SupportPage() {
  const [openFaq, setOpenFaq] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");
  const faqSectionRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return XYVOO_FAQS.filter((f) => {
      const matchesCategory = category === "All" || f.category === category;
      if (!matchesCategory) return false;
      if (!query) return true;
      return (
        f.question.toLowerCase().includes(query) ||
        f.answer.toLowerCase().includes(query) ||
        f.keywords.some((k) => k.toLowerCase().includes(query))
      );
    });
  }, [search, category]);

  const jumpToFaq = (cat: string) => {
    setCategory(cat);
    faqSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <>
      {/* Hero — dense split layout, same treatment as /solution/hms and the business-type pages */}
      <section className="relative isolate overflow-hidden border-b border-white/5 bg-[#000d1f] px-6 pt-36 pb-20 md:pb-24">
        <div className="pointer-events-none absolute inset-0 z-0" style={DARK_GRID_STYLE} aria-hidden />
        <div
          className="pointer-events-none absolute -top-16 right-[8%] z-0 h-[360px] w-[360px] rounded-full blur-[100px]"
          style={{ background: "rgb(var(--xyvoo-blue-rgb) / 0.24)" }}
          aria-hidden
        />

        <div className="relative z-10 mx-auto grid max-w-[1200px] grid-cols-1 gap-14 lg:grid-cols-[1.15fr_0.85fr] lg:items-center">
          <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.55, ease: "easeOut" }}>
            <p className="mb-5 text-eyebrow font-bold uppercase tracking-[0.22em] text-[#90caf9]">Support Center</p>
            <h1 className="text-balance text-h1 font-black leading-[1.08] tracking-tight text-white">How can we help?</h1>
            <p className="mt-6 max-w-md text-p leading-relaxed text-white/60">
              Real humans. Real answers. Search {XYVOO_FAQS.length}+ questions below, or reach the team directly.
            </p>

            <div className="relative mt-8 max-w-md">
              <Search className="pointer-events-none absolute top-1/2 left-4 h-4.5 w-4.5 -translate-y-1/2 text-white/40" />
              <input
                aria-label="Search FAQs"
                placeholder="Search FAQs..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  if (e.target.value.trim()) faqSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
                }}
                className="w-full rounded-xl border border-white/15 bg-white/[0.06] py-3.5 pr-4 pl-11 text-sm text-white placeholder:text-white/40 outline-none transition-all focus:border-[#90caf9]/50 focus:bg-white/10"
              />
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.1, ease: "easeOut" }}
            className="border-t border-white/10"
          >
            {CHANNELS.map((channel) => (
              <Link key={channel.label} href={channel.href} className="group block border-b border-white/10 py-7 first:pt-0">
                <div className="flex items-baseline justify-between gap-4">
                  <h3 className="text-lg font-bold text-white">{channel.label}</h3>
                  <span className="inline-flex shrink-0 items-center gap-1 text-xs font-bold uppercase tracking-wider text-[#90caf9] transition-colors group-hover:text-white">
                    {channel.action}
                    <ArrowUpRight className="h-3 w-3" />
                  </span>
                </div>
                <p className="mt-2 max-w-sm text-sm leading-relaxed text-white/50">{channel.desc}</p>
              </Link>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Browse by topic — quick jump into the FAQ section, pre-filtered */}
      <section className="bg-white px-6 py-20">
        <div className="mx-auto max-w-5xl">
          <motion.div
            initial="offscreen"
            whileInView="onscreen"
            viewport={{ once: true }}
            variants={fadeUp}
            className="mb-10 text-center"
          >
            <p className="mb-3 text-eyebrow font-bold uppercase tracking-widest text-xyvoo-blue">Browse by topic</p>
            <h2 className="text-h3 font-black text-xyvoo-navy">Jump straight to what you need.</h2>
          </motion.div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {CATEGORY_NAMES.map((cat, i) => (
              <CategoryTile key={cat} category={cat} count={CATEGORY_COUNTS[cat]} onSelect={jumpToFaq} index={i} />
            ))}
          </div>
        </div>
      </section>

      {/* FAQ — search + category filter + accordion */}
      <section ref={faqSectionRef} className="scroll-mt-24 bg-slate-50 py-24">
        <div className="mx-auto max-w-5xl px-6">
          <motion.div initial="offscreen" whileInView="onscreen" viewport={{ once: true }} variants={fadeUp} className="text-center mb-10">
            <p className="mb-3 text-eyebrow font-bold uppercase tracking-widest text-xyvoo-blue">FAQ</p>
            <h3 className="text-h3 font-black text-slate-900">Common questions.</h3>
          </motion.div>

          <div className="mb-6 flex flex-wrap justify-center gap-2">
            {CATEGORIES.map((c) => (
              <button
                type="button"
                key={c}
                onClick={() => setCategory(c)}
                className={`rounded-full px-4 py-2 text-sm font-medium transition-all ${
                  c === category
                    ? "bg-xyvoo-blue text-white"
                    : "bg-white text-slate-600 border border-slate-200 hover:border-slate-300"
                }`}
              >
                {c}
                {c !== "All" && <span className="ml-1.5 opacity-60">({CATEGORY_COUNTS[c]})</span>}
              </button>
            ))}
          </div>

          <p className="mb-8 text-center text-xs font-medium text-slate-400">
            Showing {filtered.length} of {XYVOO_FAQS.length} questions
          </p>

          <AnimatePresence mode="wait">
            {filtered.length === 0 ? (
              <motion.div
                key="empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="text-center py-12 text-slate-400"
              >
                <p className="mb-2">No results for &quot;{search}&quot;</p>
                <p className="text-sm">Try different keywords or a different category.</p>
              </motion.div>
            ) : (
              <motion.div
                key={`${category}-${search}`}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="space-y-3"
              >
                {filtered.map((faq, i) => {
                  const key = `${faq.category}-${faq.question}`;
                  const isOpen = openFaq === key;
                  return (
                    <motion.div
                      key={key}
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.3, delay: Math.min(i, 8) * 0.03 }}
                      className="border border-slate-200 rounded-2xl overflow-hidden bg-white"
                    >
                      <button
                        onClick={() => setOpenFaq(isOpen ? null : key)}
                        className="w-full flex items-center justify-between px-6 py-5 text-left hover:bg-slate-50 transition-colors"
                      >
                        <span className="font-semibold text-slate-900 text-sm pr-4">{faq.question}</span>
                        <motion.div animate={{ rotate: isOpen ? 180 : 0 }} transition={{ duration: 0.2 }} className="flex-shrink-0">
                          <ChevronDown className="w-5 h-5 text-slate-400" />
                        </motion.div>
                      </button>
                      <AnimatePresence>
                        {isOpen && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.25 }}
                            style={{ overflow: "hidden" }}
                          >
                            <div className="px-6 pb-5 text-sm text-slate-500 leading-relaxed border-t border-slate-100 pt-4">
                              {faq.answer}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.div>
                  );
                })}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </section>

      <section className="bg-xyvoo-navy py-20 text-center">
        <motion.div initial="offscreen" whileInView="onscreen" viewport={{ once: true }} variants={fadeUp} className="max-w-xl mx-auto px-6">
          <h3 className="text-h3 font-black text-white mb-3">Still need help?</h3>
          <p className="text-p text-slate-400 mb-8">Our team is standing by — reach out and we&apos;ll get back to you.</p>
          <Link
            href="/contact"
            className="inline-flex items-center gap-2 rounded-2xl bg-xyvoo-blue px-8 py-4 text-base font-bold text-white transition-all hover:opacity-90"
          >
            <MessageCircle className="w-5 h-5" /> Contact Support
          </Link>
        </motion.div>
      </section>
    </>
  );
}

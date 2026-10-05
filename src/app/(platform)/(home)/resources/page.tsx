"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { motion, useInView } from "framer-motion";
import { DarkSplitHero } from "@/components/website/DarkSplitHero";
import {
  ArrowRight,
  ClipboardList,
  CreditCard,
  FileText,
  RefreshCw,
  Search,
  ShoppingBag,
  TrendingUp,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { RESOURCES, RESOURCE_CATEGORIES } from "@/constants/resources";
import type { Resource, ResourceCategory } from "@/types/resources";
import type { FadeInSectionProps } from "@/types";

const HMS_ACCENT_RGB = "0 126 223";
const STOREFRONT_ACCENT_RGB = "77 208 196";

/** Same static grid backdrop used on /solution/hms, /support, /pricing and the business-type pages' hero. */
const CATEGORY_META: Record<ResourceCategory, { icon: LucideIcon; accentRgb: string }> = {
  Operations: { icon: ClipboardList, accentRgb: HMS_ACCENT_RGB },
  Revenue: { icon: TrendingUp, accentRgb: HMS_ACCENT_RGB },
  Technology: { icon: RefreshCw, accentRgb: HMS_ACCENT_RGB },
  Finance: { icon: CreditCard, accentRgb: HMS_ACCENT_RGB },
  Storefront: { icon: ShoppingBag, accentRgb: STOREFRONT_ACCENT_RGB },
};

function FadeIn({ children, delay = 0 }: FadeInSectionProps) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-60px" });
  return (
    <motion.div ref={ref} initial={{ opacity: 0, y: 24 }} animate={inView ? { opacity: 1, y: 0 } : {}} transition={{ duration: 0.55, delay }}>
      {children}
    </motion.div>
  );
}

function ResourceCard({ resource, index, onOpen }: { resource: Resource; index: number; onOpen: (r: Resource) => void }) {
  const ref = useRef<HTMLButtonElement>(null);
  const inView = useInView(ref, { once: true, margin: "-60px" });
  const { icon: Icon, accentRgb } = CATEGORY_META[resource.category];

  return (
    <motion.button
      ref={ref}
      type="button"
      onClick={() => onOpen(resource)}
      initial={{ opacity: 0, y: 20 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.5, delay: (index % 6) * 0.06, ease: [0.22, 1, 0.36, 1] }}
      whileHover={{ y: -4 }}
      className="group flex h-full flex-col rounded-2xl border border-slate-200 bg-white p-6 text-left shadow-sm transition-shadow hover:shadow-lg"
    >
      <div
        className="mb-5 inline-flex h-11 w-11 items-center justify-center rounded-xl"
        style={{ background: `rgb(${accentRgb} / 0.12)` }}
      >
        <Icon className="h-5 w-5" style={{ color: `rgb(${accentRgb})` }} />
      </div>
      <span
        className="mb-2 text-xs font-semibold uppercase tracking-wide"
        style={{ color: `rgb(${accentRgb})` }}
      >
        {resource.category}
      </span>
      <h3 className="mb-2 text-h5 font-bold text-xyvoo-navy">{resource.title}</h3>
      <p className="mb-5 flex-1 text-sm leading-relaxed text-xyvoo-navy/60 line-clamp-3">{resource.summary}</p>
      <div className="flex items-center justify-between border-t border-slate-100 pt-4 text-xs text-xyvoo-navy/45">
        <span className="flex items-center gap-1.5">
          <FileText className="h-3.5 w-3.5" /> PDF · {resource.pages} pages
        </span>
        <span className="inline-flex items-center gap-1 font-semibold text-xyvoo-navy transition-all group-hover:gap-1.5">
          View <ArrowRight className="h-3.5 w-3.5" />
        </span>
      </div>
    </motion.button>
  );
}

export default function ResourcesPage() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<ResourceCategory | "All">("All");
  const [active, setActive] = useState<Resource | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return RESOURCES.filter((r) => {
      const matchesCategory = category === "All" || r.category === category;
      const matchesQuery =
        q.length === 0 ||
        r.title.toLowerCase().includes(q) ||
        r.summary.toLowerCase().includes(q) ||
        r.tags.some((t) => t.includes(q));
      return matchesCategory && matchesQuery;
    });
  }, [query, category]);

  return (
    <>
      <DarkSplitHero
        eyebrow="Guides & Downloads"
        title="The Resource Library"
        subtitle="Practical, printable guides on running a hotel or storefront. They are free to read online or download, with no sign-up required."
        links={[
          { title: "Blog", description: "Product news, guides, and hospitality reads.", actionLabel: "Read", href: "/blog" },
          { title: "Support", description: "Help articles, FAQs, and how to get unstuck.", actionLabel: "Get help", href: "/support" },
          { title: "Talk to the team", description: "Questions about XYVOO HMS or Storefront? Tell us what you're running.", actionLabel: "Contact us", href: "/contact" },
        ]}
      />

      <section className="bg-white py-16">
        <div className="mx-auto max-w-7xl px-6">
          <FadeIn>
            <div className="mb-10 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap gap-2">
                {(["All", ...RESOURCE_CATEGORIES] as const).map((c) => (
                  <button
                    type="button"
                    key={c}
                    onClick={() => setCategory(c)}
                    className={`rounded-full px-4 py-2 text-sm font-medium transition-all ${
                      c === category ? "bg-xyvoo-blue text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }`}
                  >
                    {c}
                  </button>
                ))}
              </div>
              <div className="relative sm:w-72">
                <Search className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search resources…"
                  className="w-full rounded-full border border-slate-200 bg-slate-50 py-2.5 pr-4 pl-10 text-sm text-xyvoo-navy placeholder:text-slate-400 focus:border-xyvoo-blue focus:bg-white focus:outline-none"
                />
              </div>
            </div>
          </FadeIn>

          {filtered.length === 0 ? (
            <FadeIn>
              <p className="py-20 text-center text-p text-xyvoo-navy/50">
                No resources match &ldquo;{query}&rdquo; yet. Try a different search or category.
              </p>
            </FadeIn>
          ) : (
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
              {filtered.map((resource, i) => (
                <ResourceCard key={resource.slug} resource={resource} index={i} onOpen={setActive} />
              ))}
            </div>
          )}
        </div>
      </section>

      <Dialog open={active !== null} onOpenChange={(open) => !open && setActive(null)}>
        <DialogContent>
          {active && (
            <>
              <DialogHeader>
                <span
                  className="mb-1 text-xs font-semibold uppercase tracking-wide"
                  style={{ color: `rgb(${CATEGORY_META[active.category].accentRgb})` }}
                >
                  {active.category}
                </span>
                <DialogTitle className="text-xl font-black text-xyvoo-navy">{active.title}</DialogTitle>
                <DialogDescription className="text-sm leading-relaxed text-xyvoo-navy/60">
                  {active.summary}
                </DialogDescription>
              </DialogHeader>
              <div className="flex flex-wrap items-center gap-3 text-xs text-xyvoo-navy/45">
                <span className="flex items-center gap-1.5">
                  <FileText className="h-3.5 w-3.5" /> PDF · {active.pages} pages
                </span>
                <span>{active.readTime} read</span>
                <span>{active.audience}</span>
              </div>
              <Link
                href={`/resources/${active.slug}`}
                className="inline-flex items-center justify-center gap-2 rounded-full bg-xyvoo-navy px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-xyvoo-navy/90"
              >
                View Resource <ArrowRight className="h-4 w-4" />
              </Link>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

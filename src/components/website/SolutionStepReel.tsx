"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useInView } from "framer-motion";
import { ArrowLeft, ArrowRight } from "lucide-react";

export type SolutionStepReelStep = {
  id: string;
  title: string;
  description: string;
  explanation: string;
};

const AUTOPLAY_MS = 5000;

function FadeIn({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-60px" });
  return (
    <motion.div ref={ref} initial={{ opacity: 0, y: 20 }} animate={inView ? { opacity: 1, y: 0 } : {}} transition={{ duration: 0.55 }}>
      {children}
    </motion.div>
  );
}

const slideVariants = {
  enter: (direction: number) => ({ x: direction > 0 ? 60 : -60, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (direction: number) => ({ x: direction > 0 ? -60 : 60, opacity: 0 }),
};

/** A real slider — one step at a time, front and centre, that advances
 * itself on a timer (pausing on hover) as well as responding to the
 * numbered rail, the arrows, or a swipe. Replaces an earlier scroll-snap
 * reel that had nothing to scroll once all the cards already fit on
 * screen — clicking its numbers did nothing. */
export function SolutionStepReel({
  headingId,
  heading,
  steps,
  accentRgb,
}: {
  headingId: string;
  heading: string;
  steps: SolutionStepReelStep[];
  accentRgb: string;
}) {
  const [[active, direction], setActive] = useState<[number, number]>([0, 0]);
  const [paused, setPaused] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const wrapInView = useInView(wrapRef, { once: false, margin: "-100px" });
  const count = steps.length;

  const goTo = useCallback((idx: number, dir: number) => {
    setActive(([current]) => (idx === current ? [current, dir] : [((idx % count) + count) % count, dir]));
  }, [count]);

  useEffect(() => {
    if (paused || !wrapInView) return;
    if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = setInterval(() => {
      setActive(([current]) => [(current + 1) % count, 1]);
    }, AUTOPLAY_MS);
    return () => clearInterval(id);
  }, [paused, wrapInView, count]);

  const step = steps[active];

  return (
    <section
      ref={wrapRef}
      className="bg-slate-50 py-16 md:py-24"
      aria-labelledby={headingId}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="mx-auto max-w-[900px] px-6">
        <FadeIn>
          <div className="mb-10 flex flex-col gap-6 md:mb-12 md:flex-row md:items-end md:justify-between">
            <h3 id={headingId} className="text-h3 font-black text-xyvoo-navy">
              {heading}
            </h3>

            <div className="flex items-center gap-6">
              <div className="flex items-center gap-3">
                {steps.map((s, i) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => goTo(i, i > active ? 1 : -1)}
                    aria-label={`Go to step ${i + 1}`}
                    aria-current={i === active}
                    className="group flex items-center gap-3"
                  >
                    <span
                      className="flex h-9 w-9 items-center justify-center rounded-full border-2 text-sm font-bold transition-all duration-300"
                      style={
                        i === active
                          ? { background: `rgb(${accentRgb})`, borderColor: `rgb(${accentRgb})`, color: "white" }
                          : { borderColor: `rgb(${accentRgb} / 0.3)`, color: `rgb(${accentRgb})` }
                      }
                    >
                      {i + 1}
                    </span>
                    {i < steps.length - 1 && (
                      <span className="relative hidden h-px w-8 overflow-hidden bg-xyvoo-navy/10 sm:block">
                        <span
                          className="absolute inset-y-0 left-0 transition-all duration-500 ease-out"
                          style={{ background: `rgb(${accentRgb})`, width: i < active ? "100%" : "0%" }}
                        />
                      </span>
                    )}
                  </button>
                ))}
              </div>

              <div className="hidden items-center gap-2 sm:flex">
                <button
                  type="button"
                  onClick={() => goTo(active - 1, -1)}
                  aria-label="Previous step"
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-xyvoo-navy/15 text-xyvoo-navy/60 transition-colors hover:border-xyvoo-navy/30 hover:text-xyvoo-navy"
                >
                  <ArrowLeft className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => goTo(active + 1, 1)}
                  aria-label="Next step"
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-xyvoo-navy/15 text-xyvoo-navy/60 transition-colors hover:border-xyvoo-navy/30 hover:text-xyvoo-navy"
                >
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        </FadeIn>

        <div className="relative overflow-hidden">
          <AnimatePresence mode="wait" custom={direction} initial={false}>
            <motion.div
              key={step.id}
              custom={direction}
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
              className="rounded-3xl border bg-white p-8 md:p-10"
              style={{ borderColor: `rgb(${accentRgb} / 0.2)`, boxShadow: `0 24px 60px rgb(${accentRgb} / 0.1)` }}
            >
              <span
                className="mb-5 inline-flex h-10 w-10 items-center justify-center rounded-xl text-sm font-bold"
                style={{ background: `rgb(${accentRgb} / 0.1)`, color: `rgb(${accentRgb})` }}
              >
                {String(active + 1).padStart(2, "0")}
              </span>
              <h5 className="text-h5 font-bold text-xyvoo-navy">{step.title}</h5>
              <p className="mt-3 text-p leading-relaxed text-xyvoo-navy/70">{step.description}</p>
              <p className="mt-4 border-t border-slate-100 pt-4 text-sm leading-relaxed text-xyvoo-navy/50">{step.explanation}</p>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </section>
  );
}

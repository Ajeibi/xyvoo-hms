"use client";

import { useEffect, useRef } from "react";

export type SolutionFeatureShowcaseItem = {
  title: string;
  description: string;
};

/** Scroll distance per card transition, and a short dwell once the last
 * card arrives — same idea as SolutionGrowthStack's pin math, applied to a
 * different visual: instead of an arc-swing, each card crossfades in with a
 * lift + blur-to-focus, and settles centre-stage until the next one takes
 * over. Continuous, never snapped, so it tracks scroll speed 1:1. */
const PER_ITEM_VH = 85;
const DWELL_VH = 45;

/** Pinned, scroll-driven feature reveal — a numbered index + progress rail
 * on the left stays put while a single card at a time crossfades through on
 * the right, lifting into focus and then drifting up and out of frame as
 * the next one arrives. Built for feature sets too long for a flat grid to
 * feel considered (up to ~10 items) without turning into a wall of cards. */
export function SolutionFeatureShowcase({
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
  items: SolutionFeatureShowcaseItem[];
  accentRgb: string;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<Array<HTMLElement | null>>([]);
  const counterRef = useRef<HTMLSpanElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const dotRefs = useRef<Array<HTMLSpanElement | null>>([]);
  const count = items.length;
  const totalVh = PER_ITEM_VH * Math.max(1, count - 1) + DWELL_VH;

  useEffect(() => {
    let ticking = false;

    function layout() {
      const wrap = wrapRef.current;
      if (!wrap) return;
      const rect = wrap.getBoundingClientRect();
      const total = wrap.offsetHeight - window.innerHeight;
      let progress = total > 0 ? -rect.top / total : 0;
      progress = Math.max(0, Math.min(1, progress));
      const raw = progress * Math.max(1, count - 1);

      cardRefs.current.forEach((card, i) => {
        if (!card) return;
        const local = raw - i; // <0 waiting in the wings, 0 = front and centre, >0 exiting

        if (local <= 0) {
          // Not its turn yet — held just off-frame below, blurred, invisible
          // until it's within a beat of becoming active.
          const dist = Math.min(1, -local);
          const op = 1 - dist;
          const y = dist * 34;
          const scale = 1 - dist * 0.05;
          const blur = dist * 10;
          card.style.transform = `translateY(${y}px) scale(${scale})`;
          card.style.opacity = String(op);
          card.style.filter = `blur(${blur}px)`;
          card.style.zIndex = String(20 - Math.round(dist * 8));
          card.style.pointerEvents = dist < 0.04 ? "auto" : "none";
        } else {
          // Had its turn — lifts further and fades out, driven 1:1 by scroll.
          const t = Math.min(1, local);
          const op = 1 - t;
          const y = -t * 46;
          const scale = 1 + t * 0.015;
          const blur = t * 6;
          card.style.transform = `translateY(${y}px) scale(${scale})`;
          card.style.opacity = String(op);
          card.style.filter = `blur(${blur}px)`;
          card.style.zIndex = "30";
          card.style.pointerEvents = "none";
        }
      });

      const activeIdx = Math.max(0, Math.min(count - 1, Math.round(raw)));
      if (counterRef.current) counterRef.current.textContent = String(activeIdx + 1).padStart(2, "0");
      if (barRef.current) barRef.current.style.width = `${(activeIdx / Math.max(1, count - 1)) * 100}%`;
      dotRefs.current.forEach((dot, i) => {
        if (!dot) return;
        dot.style.opacity = i === activeIdx ? "1" : "0.28";
        dot.style.transform = i === activeIdx ? "scale(1.4)" : "scale(1)";
      });
    }

    function onScroll() {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        layout();
        ticking = false;
      });
    }

    layout();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [count]);

  return (
    <section className="relative bg-white" aria-labelledby={headingId}>
      <div ref={wrapRef} style={{ height: `${totalVh}vh` }} className="relative">
        <div className="sticky top-0 flex h-screen items-center overflow-hidden px-6">
          <div
            className="pointer-events-none absolute -top-24 right-[6%] h-[420px] w-[420px] rounded-full blur-[120px]"
            style={{ background: `rgb(${accentRgb} / 0.1)` }}
            aria-hidden
          />

          <div className="relative z-10 mx-auto grid w-full max-w-[1200px] grid-cols-1 items-center gap-12 lg:grid-cols-[0.85fr_1.15fr] lg:gap-20">
            <div>
              <p className="mb-3 text-eyebrow font-bold uppercase tracking-[0.22em]" style={{ color: `rgb(${accentRgb})` }}>
                {eyebrow}
              </p>
              <h3 id={headingId} className="text-h3 font-black leading-[1.15] text-xyvoo-navy">
                {title}
              </h3>
              <p className="mt-4 max-w-sm text-p leading-relaxed text-xyvoo-navy/60">{intro}</p>

              <div className="mt-10 flex items-center gap-4">
                <span ref={counterRef} className="font-mono text-sm font-bold tabular-nums" style={{ color: `rgb(${accentRgb})` }}>
                  01
                </span>
                <div className="relative h-px flex-1 bg-xyvoo-navy/10">
                  <div
                    ref={barRef}
                    className="absolute inset-y-0 left-0 h-px transition-[width] duration-100 ease-out"
                    style={{ background: `rgb(${accentRgb})`, width: "0%" }}
                  />
                </div>
                <span className="font-mono text-sm text-xyvoo-navy/30 tabular-nums">{String(count).padStart(2, "0")}</span>
              </div>

              <div className="mt-5 hidden flex-wrap gap-2 sm:flex">
                {items.map((item, i) => (
                  <span
                    key={item.title}
                    ref={(el) => {
                      dotRefs.current[i] = el;
                    }}
                    className="h-1.5 w-1.5 rounded-full transition-transform duration-200"
                    style={{ background: `rgb(${accentRgb})`, opacity: i === 0 ? 1 : 0.28 }}
                    aria-hidden
                  />
                ))}
              </div>
            </div>

            <div className="relative min-h-[420px] sm:min-h-[380px]">
              {items.map((item, i) => (
                <article
                  key={item.title}
                  ref={(el) => {
                    cardRefs.current[i] = el;
                  }}
                  className="absolute inset-0 flex flex-col justify-center rounded-3xl border bg-white p-8 shadow-[0_24px_70px_rgba(0,13,31,0.1)] will-change-transform md:p-10"
                  style={{ borderColor: `rgb(${accentRgb} / 0.18)` }}
                >
                  <span
                    className="mb-5 inline-flex h-10 w-10 items-center justify-center rounded-xl text-sm font-bold"
                    style={{ background: `rgb(${accentRgb} / 0.1)`, color: `rgb(${accentRgb})` }}
                  >
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <h5 className="text-h5 font-bold text-xyvoo-navy">{item.title}</h5>
                  <p className="mt-3 text-p leading-relaxed text-xyvoo-navy/60">{item.description}</p>
                </article>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

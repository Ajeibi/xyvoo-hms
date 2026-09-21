"use client";

import { useEffect, useRef } from "react";
import type { SolutionsStorefrontStackModule } from "@/constants/solutions-storefront";
import { SOLUTIONS_STOREFRONT_GROWTH_STACK_HEADING } from "@/constants/solutions-storefront";
import styles from "./StorefrontGrowthStack.module.css";

/** Exit motion: once a card's turn is up it swings away on a circular arc
 * pivoting from a point off to the right of the card — rather than
 * hand-computing that arc's x/y, the rotation origin just moves out there
 * and the card rotates; the arc falls out of that for free. A negative
 * (counter-clockwise) turn from a due-right pivot sweeps the card down and
 * to the left first, which reads as "top to bottom, towards the left" —
 * it keeps swinging until it fades out completely. The last card never gets
 * this treatment: it glides in like the others, then just holds until the
 * section releases into normal scroll (see the `isLast` branch below). */
const EXIT_ORIGIN = "calc(100% + 120px) 30%";
const EXIT_SWEEP_DEG = 100;

/** Scroll distance per card transition, and a much shorter dwell for the
 * last card once it arrives (it never exits — see the `isLast` branch —
 * so it doesn't need a full transition's worth of scroll, just enough to
 * read it before the section releases into normal scroll). Giving the
 * dwell its own short share, instead of splitting the total evenly across
 * all `count` cards, is what keeps that final stretch from dragging. */
const PER_TRANSITION_VH = 130;
const DWELL_VH = 50;

/** Short name for the top strip and tagline, e.g. "05 — Marketing & Growth" -> "Marketing & Growth" */
function shortName(moduleNumber: string): string {
  return moduleNumber.split("—")[1]?.trim() ?? moduleNumber;
}

export function StorefrontGrowthStack({
  modules,
}: {
  modules: SolutionsStorefrontStackModule[];
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<Array<HTMLElement | null>>([]);
  const tickRefs = useRef<Array<HTMLDivElement | null>>([]);
  const count = modules.length;
  const transitionTotalVh = PER_TRANSITION_VH * Math.max(0, count - 1);
  const totalVh = transitionTotalVh + DWELL_VH;

  useEffect(() => {
    let ticking = false;
    // What fraction of the pin's scroll range is spent on actual card
    // transitions vs. the last card's short dwell at the end.
    const transitionFraction = transitionTotalVh > 0 ? transitionTotalVh / totalVh : 0;

    function layout() {
      const wrap = wrapRef.current;
      if (!wrap) return;
      const rect = wrap.getBoundingClientRect();
      const total = wrap.offsetHeight - window.innerHeight;
      let progress = total > 0 ? -rect.top / total : 0;
      progress = Math.max(0, Math.min(1, progress));
      // continuous — never floored/snapped. Capped at count - 1 once past
      // the transition fraction, so the last card just holds through the
      // dwell instead of a fourth "transition" being implied that never
      // actually plays.
      const raw =
        transitionFraction > 0 && progress <= transitionFraction
          ? (progress / transitionFraction) * (count - 1)
          : count - 1;

      cardRefs.current.forEach((card, i) => {
        if (!card) return;
        const isLast = i === count - 1;
        const local = raw - i; // <0 waiting in the stack, 0 = front, >0 exiting

        if (local <= 0 || isLast) {
          // Resting fan: continuous distance, so a card arriving at the
          // front glides in smoothly instead of popping into place. Peeks
          // up and to the right, fanned-deck style, so the 2nd/3rd cards
          // read clearly at rest instead of hiding behind the front one.
          // The last card clamps distance at 0 once it arrives, so it just
          // holds in front position — it never runs the exit swing below.
          const dist = isLast ? Math.max(0, Math.min(2.2, -local)) : Math.min(2.2, -local);
          const x = dist * 22;
          const y = -dist * 20;
          const scale = Math.max(0.9, 1 - dist * 0.035);
          const rot = dist * 6;
          const op = Math.max(0.6, 1 - dist * 0.16);
          card.style.transformOrigin = "50% 50%";
          card.style.transform = `translate(${x}px,${y}px) rotate(${rot}deg) scale(${scale})`;
          card.style.opacity = String(op);
          card.style.zIndex = String(20 - Math.round(dist * 10));
          card.style.pointerEvents = dist < 0.02 ? "auto" : "none";
        } else {
          // Exit swing, driven 1:1 by scroll — t is exactly how far through
          // its own turn this card is, so speed is however fast you scroll.
          const t = Math.min(1, local);
          const angle = -t * EXIT_SWEEP_DEG;
          const scale2 = 1 - t * 0.3;
          const op2 = Math.pow(1 - t, 1.6);
          card.style.transformOrigin = EXIT_ORIGIN;
          card.style.transform = `rotate(${angle}deg) scale(${scale2})`;
          card.style.opacity = String(op2);
          card.style.zIndex = "22";
          card.style.pointerEvents = "none";
        }
      });

      const activeIdx = Math.max(0, Math.min(count - 1, Math.round(raw)));
      tickRefs.current.forEach((tick, i) => {
        if (!tick) return;
        tick.classList.toggle(styles.isActive, i === activeIdx);
        tick.classList.toggle(styles.isDone, i < activeIdx);
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
  }, [count, transitionTotalVh, totalVh]);

  return (
    <div className={styles.wrap}>
      <div className={styles.pinWrap} ref={wrapRef} style={{ height: `${totalVh}vh` }}>
        <div className={styles.pinInner}>
          <div className={styles.topStrip}>
            <p className={styles.eyebrow}>{SOLUTIONS_STOREFRONT_GROWTH_STACK_HEADING.eyebrow}</p>
            <p className={styles.topStripLine}>
              {modules.map((module, i) => (
                <span key={module.id}>
                  {i > 0 && (
                    <span className={styles.dot} aria-hidden>
                      ·
                    </span>
                  )}
                  {shortName(module.number)}
                </span>
              ))}
            </p>
          </div>

          <div className={styles.grid}>
            {/* Four direct grid children (not two wrapper divs) so mobile
                can independently reorder just the subtitle to come after
                the card stack — via grid-area, not DOM order — while
                desktop keeps heading/subtitle/ticks stacked as before. */}
            <h2 className={styles.heading}>{SOLUTIONS_STOREFRONT_GROWTH_STACK_HEADING.title}</h2>

            <div className={styles.ticks}>
              {modules.map((module, i) => (
                <div
                  key={module.id}
                  ref={(el) => {
                    tickRefs.current[i] = el;
                  }}
                  className={styles.tick}
                >
                  <span className={styles.bar} />
                  {String(i + 1).padStart(2, "0")}
                </div>
              ))}
            </div>

            <div className={styles.stack}>
              {modules.map((module, i) => (
                <article
                  key={module.id}
                  ref={(el) => {
                    cardRefs.current[i] = el;
                  }}
                  className={styles.card}
                >
                  <span className={styles.num}>
                    {String(i + 1).padStart(2, "0")} — {shortName(module.number)}
                  </span>
                  <h3>{module.title}</h3>
                  <p>{module.description}</p>
                </article>
              ))}
            </div>

            <p className={styles.subtitle}>{SOLUTIONS_STOREFRONT_GROWTH_STACK_HEADING.subtitle}</p>
          </div>

          <p className={styles.tagline}>
            Still just <strong>one dashboard</strong> — not three separate tools bolted together.
          </p>
        </div>
      </div>
    </div>
  );
}

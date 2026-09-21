"use client";

import { useEffect, useRef } from "react";
import styles from "./SolutionsOnboardingStack.module.css";

export type SolutionsOnboardingCard = {
  id: string;
  title: string;
  /** Shown on the card itself, under the title. */
  description: string;
  /** Broader explanation — revealed once the deck is fully open. */
  explanation: string;
};

/** Deliberately irregular per-card offsets (not an even arithmetic fan) so
 * the stacked start state reads as shuffled rather than mechanically
 * stacked. Last entry is the front card: centred, unrotated, on top. */
const OFFSETS = [
  { x: -22, y: -17, rot: -10 },
  { x: -9, y: 7, rot: 6 },
  { x: 15, y: -11, rot: 7 },
  { x: 0, y: 0, rot: 0 },
];

/** Progress 1 is reached once the heading has scrolled up to this fraction
 * of the viewport height — no reserved/padded scroll track, this just
 * rides the natural distance the page travels as it scrolls. Progress is
 * pinned at 0 (the stacked start state, untouched) until the heading's own
 * top edge — its first line — has actually scrolled into view; it must not
 * start earlier than that. Monotonic 0 -> 1, then held at 1 for the rest of
 * the scroll — the deck opens once and stays open. */
const SETTLE_AT = 0.15;

/** The stacked deck's actual height — used for the FLIP's start point
 * instead of startSlot's own (deliberately animated-to-0) height, so the
 * open animation's curve doesn't get skewed by its own placeholder
 * shrinking at the same time. */
const STACKED_HEIGHT = 400;

/** Below this width — or below this height — the whole scroll-morph is
 * skipped, and the cards just render as a plain static stacked list
 * instead (see the .module.css media query, which matches both
 * conditions too). Width alone isn't enough: a short/landscape phone can
 * easily be wider than 860px while still only being ~400px tall, and the
 * fully-open deck (well over 400px tall at rest) would then overflow the
 * viewport — the fixed box just spills out above the top of the screen,
 * cutting into where the header sits. */
const MOBILE_BREAKPOINT = 860;
const MOBILE_HEIGHT_BREAKPOINT = 500;

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Two-column 65/35 block that morphs on scroll: starts as a heading (left)
 * beside a small stacked deck of cards (right column), then, as the
 * section scrolls into view, the deck leaves the right column and spreads
 * into an independent, full-width row below the heading, each card
 * growing to also reveal its broader explanation. The heading itself is
 * plain, normal-flow content (it just scrolls by); only the card layer
 * has scroll-linked movement. `accentColor`/`accentRgb` carry each
 * solution's own brand colour (e.g. storefront's green vs HMS's blue). */
export function SolutionsOnboardingStack({
  heading,
  cards,
  accentColor,
  accentRgb,
}: {
  heading: string;
  cards: SolutionsOnboardingCard[];
  accentColor: string;
  accentRgb: string;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const startSlotRef = useRef<HTMLDivElement>(null);
  const endSlotRef = useRef<HTMLDivElement>(null);
  const floatRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<Array<HTMLElement | null>>([]);
  const explanationRefs = useRef<Array<HTMLElement | null>>([]);
  const count = cards.length;

  useEffect(() => {
    let ticking = false;

    function layout() {
      const wrap = wrapRef.current;
      const heading = headingRef.current;
      const startSlot = startSlotRef.current;
      const endSlot = endSlotRef.current;
      const float = floatRef.current;
      if (!wrap || !heading || !startSlot || !endSlot || !float) return;

      if (window.innerWidth <= MOBILE_BREAKPOINT || window.innerHeight <= MOBILE_HEIGHT_BREAKPOINT) {
        // Clear every inline style the desktop animation may have set on
        // a wider viewport, so the mobile media query's plain static
        // layout applies cleanly instead of fighting leftover values.
        wrap.style.paddingTop = "";
        endSlot.style.marginTop = "";
        startSlot.style.height = "";
        float.style.left = "";
        float.style.top = "";
        float.style.width = "";
        float.style.height = "";
        cardRefs.current.forEach((card) => {
          if (!card) return;
          card.style.left = "";
          card.style.width = "";
          card.style.height = "";
          card.style.transform = "";
          card.style.minHeight = "";
        });
        explanationRefs.current.forEach((explanation) => {
          if (!explanation) return;
          explanation.style.opacity = "";
          explanation.style.maxHeight = "";
          explanation.style.borderTopColor = "";
          explanation.style.transform = "";
        });
        return;
      }

      const vh = window.innerHeight;
      const headingTop = heading.getBoundingClientRect().top;
      // Gated on the heading itself, not the section's outer edge: while
      // its top is still below the viewport (not yet visible), this stays
      // exactly 0 — the untouched stacked start state.
      const enterAt = vh;
      const settleAt = SETTLE_AT * vh;
      const progress = clamp01((enterAt - headingTop) / (enterAt - settleAt));

      // The section eases in tighter as it opens: less top padding, and a
      // smaller gap between the heading and the (by then full-width) row
      // of cards below it. All set before the rects below are read, so the
      // FLIP target reflects the tightened-up geometry.
      wrap.style.paddingTop = `${lerp(48, 24, progress)}px`;
      endSlot.style.marginTop = `${lerp(40, 45, progress)}px`;
      // startSlot's height is what makes the grid row tall in the first
      // place — with `align-items: center` that leaves dead space below
      // the (much shorter) heading. Collapsing it as we open removes that
      // space instead of just papering over it with a smaller margin.
      startSlot.style.height = `${lerp(STACKED_HEIGHT, 0, progress)}px`;

      // FLIP: the visible fixed layer's box is lerped between the start
      // slot's rect (small, within the right column) and the end slot's
      // rect (full width, below the heading) — both re-measured every
      // frame, so before/after the transition window it just tracks
      // whichever slot is relevant, exactly like a normal element would.
      // startSlot's own height is swapped back out for STACKED_HEIGHT here
      // (see the constant's comment above) rather than its animated value.
      const startSlotRect = startSlot.getBoundingClientRect();
      const r1 = {
        left: startSlotRect.left,
        top: startSlotRect.top,
        width: startSlotRect.width,
        height: STACKED_HEIGHT,
      };
      const r2 = endSlot.getBoundingClientRect();
      float.style.left = `${lerp(r1.left, r2.left, progress)}px`;
      float.style.top = `${lerp(r1.top, r2.top, progress)}px`;
      float.style.width = `${lerp(r1.width, r2.width, progress)}px`;
      float.style.height = `${lerp(r1.height, r2.height, progress)}px`;

      const explanationOpacity = clamp01((progress - 0.7) / 0.3);

      // Card width is lerped in px, not a fraction of the (currently
      // interpolating) float box — from the old stacked card's own size up
      // to an even share of the *final* full-width row, so cards don't
      // shrink away mid-transition before growing back.
      const gap = 24;
      const stackedWidthPx = 300;
      const expandedWidthPx = (r2.width - gap * (count - 1)) / count;
      const widthPx = lerp(stackedWidthPx, expandedWidthPx, progress);

      cardRefs.current.forEach((card, i) => {
        if (!card) return;
        const { x, y, rot } = OFFSETS[i % OFFSETS.length];
        // Stacked (progress 0): all cards centred at the same 50% spot,
        // offset only by their irregular OFFSETS. Expanded (progress 1):
        // each card gets its own even slot across the full row.
        const stackedCenterPct = 50;
        const expandedCenterPct = ((i + 0.5) / count) * 100;
        const centerPct = lerp(stackedCenterPct, expandedCenterPct, progress);
        const offsetX = lerp(x, 0, progress);
        const offsetY = lerp(y, 0, progress);
        const rotation = lerp(rot, 0, progress);
        const minHeight = lerp(270, 420, progress);

        card.style.left = `${centerPct}%`;
        card.style.width = `${widthPx}px`;
        card.style.height = "auto";
        card.style.transform = `translate(calc(-50% + ${offsetX}px), calc(-50% + ${offsetY}px)) rotate(${rotation}deg)`;
        card.style.minHeight = `${minHeight}px`;

        // The explanation only starts taking up real space as it fades
        // in — before that, its (invisible) text must not be able to
        // stretch the stacked card taller than the others.
        const explanation = explanationRefs.current[i];
        if (explanation) {
          explanation.style.opacity = String(explanationOpacity);
          explanation.style.maxHeight = `${explanationOpacity * 220}px`;
          explanation.style.borderTopColor = `rgba(13, 27, 42, ${0.1 * explanationOpacity})`;
          explanation.style.transform = `translateY(${(1 - explanationOpacity) * 8}px)`;
        }
      });

      // All four cards must read as the same height regardless of how much
      // their own title/description/explanation text naturally needs —
      // measure each one's true content height, then pin every card to
      // whichever needed the most. `offsetHeight`, not
      // getBoundingClientRect(), because the stacked cards are rotated and
      // a rotated box's client rect is inflated by that rotation.
      let tallest = 0;
      cardRefs.current.forEach((card) => {
        if (card) tallest = Math.max(tallest, card.offsetHeight);
      });
      cardRefs.current.forEach((card) => {
        if (card) card.style.height = `${tallest}px`;
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
    <section
      className={styles.wrap}
      ref={wrapRef}
      style={{ ["--accent" as string]: accentColor, ["--accent-rgb" as string]: accentRgb }}
    >
      <div className={styles.container}>
        <div className={styles.grid}>
          <h2 className={styles.heading} ref={headingRef}>
            {heading}
          </h2>
          {/* Invisible — reserves the layout space the stacked deck starts
              in; its measured rect is the FLIP animation's start point. */}
          <div className={styles.startSlot} ref={startSlotRef} />
        </div>
        {/* Invisible — reserves the layout space the expanded row settles
            into; its measured rect is the FLIP animation's end point. */}
        <div className={styles.endSlot} ref={endSlotRef} />
      </div>

      <div className={styles.floatStage} ref={floatRef}>
        {cards.map((card, i) => (
          <article
            key={card.id}
            className={styles.card}
            style={{ zIndex: 10 + i }}
            ref={(el) => {
              cardRefs.current[i] = el;
            }}
          >
            <span className={styles.num}>{String(i + 1).padStart(2, "0")}</span>
            <h3>{card.title}</h3>
            <p>{card.description}</p>
            <p
              className={styles.explanation}
              ref={(el) => {
                explanationRefs.current[i] = el;
              }}
            >
              {card.explanation}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}

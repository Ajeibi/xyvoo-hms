"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import { Icon } from "./primitives";

/*
 * The templates' scroll-snap carousel: the track scrolls natively (and works
 * without JavaScript); the previous/next buttons appear once it runs. Split
 * into parts because each template places its buttons differently.
 */

type CarouselState = {
  track: React.RefObject<HTMLUListElement | null>;
  atStart: boolean;
  atEnd: boolean;
  step: (dir: -1 | 1) => void;
};

const Ctx = createContext<CarouselState | null>(null);

function useCarousel() {
  const value = useContext(Ctx);
  if (!value) throw new Error("Carousel parts must be inside <CarouselRoot>");
  return value;
}

export function CarouselRoot({ children }: { children: React.ReactNode }) {
  const track = useRef<HTMLUListElement>(null);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(false);

  useEffect(() => {
    const el = track.current;
    if (!el) return;
    const update = () => {
      setAtStart(el.scrollLeft <= 4);
      setAtEnd(el.scrollLeft + el.clientWidth >= el.scrollWidth - 4);
    };
    update();
    el.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      el.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  const step = (dir: -1 | 1) => {
    const el = track.current;
    if (!el) return;
    const item = el.querySelector("li");
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollBy({ left: dir * (item ? item.getBoundingClientRect().width + 16 : el.clientWidth), behavior: reduce ? "auto" : "smooth" });
  };

  return <Ctx.Provider value={{ track, atStart, atEnd, step }}>{children}</Ctx.Provider>;
}

export function CarouselTrack({ id, label, className = "carousel", children }: { id: string; label: string; className?: string; children: React.ReactNode }) {
  const { track } = useCarousel();
  return (
    <ul className={className} id={id} ref={track} tabIndex={0} aria-label={label}>
      {children}
    </ul>
  );
}

export function CarouselControls({
  trackId,
  noun,
  prevClassName = "round-btn",
  nextClassName = "round-btn",
}: {
  trackId: string;
  /** Used in the button labels, e.g. "reviews" gives "Previous reviews". */
  noun: string;
  prevClassName?: string;
  nextClassName?: string;
}) {
  const { atStart, atEnd, step } = useCarousel();
  return (
    <div className="carousel-controls">
      <button className={prevClassName} type="button" aria-label={`Previous ${noun}`} aria-controls={trackId} disabled={atStart} onClick={() => step(-1)}>
        <Icon name="chevron-left" size="sm" />
      </button>
      <button className={nextClassName} type="button" aria-label={`Next ${noun}`} aria-controls={trackId} disabled={atEnd} onClick={() => step(1)}>
        <Icon name="chevron-right" size="sm" />
      </button>
    </div>
  );
}

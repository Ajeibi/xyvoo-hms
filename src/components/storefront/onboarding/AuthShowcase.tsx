"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Pause, Play } from "lucide-react";
import { cn } from "@/lib/utils";
import { ONBOARDING_SHOWCASE } from "./OnboardingShowcase";

/*
 * The photo panel beside the storefront sign-in and register forms: the same
 * four people as the setup steps, taking turns with a slow fade. It pauses on
 * hover or focus, has a pause button and dots, and stays still for anyone who
 * prefers reduced motion.
 */

const SLIDES = Object.values(ONBOARDING_SHOWCASE).filter((s) => s !== undefined);
const INTERVAL_MS = 8000;

export default function AuthShowcase({ start = 0 }: { start?: number }) {
  const [index, setIndex] = useState(start % SLIDES.length);
  const [paused, setPaused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  const playing = !paused && !hovered && !reducedMotion;
  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => setIndex((i) => (i + 1) % SLIDES.length), INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [playing]);

  return (
    <section
      aria-roledescription="carousel"
      aria-label="What people say about XYVOO"
      className="relative isolate h-full w-full overflow-hidden bg-slate-900"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setHovered(true)}
      onBlur={() => setHovered(false)}
    >
      {SLIDES.map((slide, i) => (
        <figure
          key={slide.name}
          aria-roledescription="slide"
          aria-label={`${i + 1} of ${SLIDES.length}`}
          aria-hidden={i !== index}
          className={cn(
            "absolute inset-0 transition-opacity duration-1000 motion-reduce:transition-none",
            i === index ? "opacity-100" : "opacity-0",
          )}
        >
          <Image
            src={slide.image}
            alt={`Portrait of ${slide.name}`}
            fill
            preload={i === start % SLIDES.length}
            sizes="(min-width: 1024px) 50vw, 1px"
            className="-z-10 object-cover object-[center_20%]"
          />
          {/* Dark at the bottom so the white words stay readable on any photo. */}
          <div className="absolute inset-0 -z-10 bg-gradient-to-t from-black/85 via-black/35 to-transparent" aria-hidden />
          <div className="flex h-full flex-col justify-end p-10 pb-20 text-white xl:p-14 xl:pb-24">
            <blockquote className="max-w-lg text-2xl font-bold leading-snug">
              <p>{slide.quote}</p>
            </blockquote>
            <figcaption className="mt-4 text-sm">
              <span className="font-semibold text-white">{slide.name}</span>
              <span className="text-white/70"> · </span>
              <span className="font-medium text-xyvoo-blue-light">{slide.role}</span>
            </figcaption>
          </div>
        </figure>
      ))}

      <div className="absolute bottom-8 left-10 flex items-center gap-3 xl:left-14">
        <button
          type="button"
          onClick={() => setPaused((p) => !p)}
          aria-label={paused ? "Play the photos" : "Pause the photos"}
          className="flex h-8 w-8 items-center justify-center rounded-full bg-white/15 text-white transition-colors hover:bg-white/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
        >
          {paused ? <Play className="h-3.5 w-3.5" aria-hidden /> : <Pause className="h-3.5 w-3.5" aria-hidden />}
        </button>
        {SLIDES.map((slide, i) => (
          <button
            key={slide.name}
            type="button"
            onClick={() => setIndex(i)}
            aria-label={`Show ${slide.name}`}
            aria-current={i === index}
            className="group flex h-8 items-center px-0.5 focus-visible:outline-none"
          >
            <span
              className={cn(
                "block h-1.5 rounded-full transition-all group-focus-visible:ring-2 group-focus-visible:ring-white",
                i === index ? "w-6 bg-white" : "w-1.5 bg-white/50 group-hover:bg-white/80",
              )}
            />
          </button>
        ))}
      </div>
    </section>
  );
}

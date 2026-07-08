"use client";

import { useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";

/**
 * Handles ?section=<id> query param and scrolls the closest scrollable
 * ancestor of the matching element into view.
 *
 * This is needed because the HMS shell sets overflow:hidden on html/body
 * and scrolls inside a <main> element — so the browser's native hash-scroll
 * won't work. We do it manually here instead.
 */
export function SettingsSectionScroller() {
  const searchParams = useSearchParams();
  const section = searchParams.get("section");
  const hasScrolled = useRef(false);

  useEffect(() => {
    if (!section || hasScrolled.current) return;

    const el = document.getElementById(section);
    if (!el) return;

    // Walk up to find the nearest scrollable ancestor (the HMS <main> element)
    let scrollParent: HTMLElement | null = el.parentElement;
    while (scrollParent) {
      const { overflowY } = getComputedStyle(scrollParent);
      if (overflowY === "auto" || overflowY === "scroll") break;
      scrollParent = scrollParent.parentElement;
    }

    const headerHeight = 72; // 4.5rem — matches HMS shell header h-[4.5rem]
    const target = scrollParent ?? document.documentElement;
    const top =
      el.getBoundingClientRect().top +
      (target === document.documentElement
        ? window.scrollY
        : target.scrollTop) -
      headerHeight -
      16; // 16px extra breathing room

    target.scrollTo({ top, behavior: "smooth" });
    hasScrolled.current = true;
  }, [section]);

  return null;
}

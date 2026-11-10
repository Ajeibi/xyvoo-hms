"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { motion, useScroll, useSpring } from "framer-motion";
import { gsap, ScrollTrigger } from "@/lib/motion/gsap";
import { LOGO_LIGHT_URL, LOGO_URL } from "@/constants/branding";

const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/* -------------------------------------------------------------------------- */
/*  Selectors                                                                  */
/* -------------------------------------------------------------------------- */

/** Never animate anything inside these (chrome, overlays, decorative layers). */
const SKIP_SEL =
  'header, [role="dialog"], [data-sidebar], [data-motion="off"], .sr-only, [aria-hidden="true"], [class*="marquee"], [role="tablist"], [role="tabpanel"], video, canvas';

/**
 * Elements Framer Motion (or earlier code) already drives carry inline
 * transform/opacity. Leave those alone so two engines never fight over one node.
 */
const DRIVEN_SEL = '[style*="transform"], [style*="opacity"], [style*="translate"]';

/** Paths that live outside the marketing shell: no curtain, the layout unmounts. */
const NO_CURTAIN_PREFIXES = [
  "/hms",
  "/admin",
  "/api",
  "/tenants",
  "/menu",
  "/storefront",
  "/stay",
  "/onboard",
  "/check-in-online",
  "/feedback",
  "/join",
  "/unsubscribe",
  "/hms-print",
];

const COUNTER_RE = /^([~<>$₦£€]?)(\d[\d,]*(?:\.\d+)?)(\s?(?:%|\+|k|K|M|B|x|×|\+%)?)$/;

/* -------------------------------------------------------------------------- */
/*  Loader themes: the curtain matches the hero of the page being opened       */
/* -------------------------------------------------------------------------- */

type CurtainTheme = "white" | "blue" | "green";

const CURTAIN_COLORS: Record<
  CurtainTheme,
  { accent: string; bg: string; glow: string; bar: string; dark: boolean }
> = {
  white: { accent: "#cfe5fb", bg: "#ffffff", glow: "rgba(21,101,192,0.18)", bar: "#1565c0", dark: false },
  blue: { accent: "#1565c0", bg: "#000d1f", glow: "rgba(21,101,192,0.55)", bar: "#90caf9", dark: true },
  green: { accent: "#4dd0c4", bg: "#04140f", glow: "rgba(77,208,196,0.45)", bar: "#4dd0c4", dark: true },
};

const GREEN_HERO_PREFIXES = [
  "/solution/storefront",
  "/templates",
  "/business-types/solo-sellers",
  "/business-types/growing-retailers",
];
const BLUE_HERO_PREFIXES = [
  "/solution/hms",
  "/business-types/independent-hotels",
  "/business-types/hotel-groups",
];
const BLUE_HERO_EXACT = ["/support", "/pricing", "/blog", "/resources"];

/** Which loader to show for the page at `pathname` (mirrors each page's hero). */
function curtainThemeFor(pathname: string): CurtainTheme {
  const under = (p: string) => pathname === p || pathname.startsWith(p + "/");
  if (GREEN_HERO_PREFIXES.some(under)) return "green";
  if (BLUE_HERO_PREFIXES.some(under) || BLUE_HERO_EXACT.includes(pathname)) return "blue";
  return "white";
}

const CURTAIN_WORDS: [string, string][] = [
  ["/solution/hms/guest-experience", "guests"],
  ["/solution/hms/operations", "behind"],
  ["/solution/hms/finance-analytics", "numbers"],
  ["/solution/hms", "hotels"],
  ["/solution/storefront/customer-engagement", "loyal"],
  ["/solution/storefront/payments", "paid"],
  ["/solution/storefront/inventory", "stock"],
  ["/solution/storefront", "stores"],
  ["/business-types/independent-hotels", "inn"],
  ["/business-types/hotel-groups", "groups"],
  ["/business-types/solo-sellers", "solo"],
  ["/business-types/growing-retailers", "growth"],
  ["/templates", "looks"],
  ["/about", "story"],
  ["/contact", "hello"],
  ["/waitlist", "soon"],
  ["/support", "help"],
  ["/pricing", "plans"],
  ["/blog", "stories"],
  ["/resources", "guides"],
];

/** The lowercase word shown behind the loader for the page being opened. */
function curtainWordFor(pathname: string): string {
  if (pathname === "/") return "xyvoo";
  const hit = CURTAIN_WORDS.find(([p]) => pathname === p || pathname.startsWith(p + "/"));
  return hit ? hit[1] : "xyvoo";
}

/** Survives layout remounts (e.g. marketing → auth) so the curtain can finish. */
let curtainPending = false;
let curtainTheme: CurtainTheme = "white";
let curtainWord = "xyvoo";
let headerIntroPlayed = false;

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                    */
/* -------------------------------------------------------------------------- */

type Restore = () => void;

function usable(el: Element): el is HTMLElement {
  if (!(el instanceof HTMLElement)) return false;
  return !el.closest(SKIP_SEL) && !el.closest(DRIVEN_SEL);
}

function isInside(el: Element, set: Set<Element>): boolean {
  for (let n: Element | null = el; n; n = n.parentElement) {
    if (set.has(n)) return true;
  }
  return false;
}

function hasSize(el: Element, minW = 1, minH = 1) {
  const r = el.getBoundingClientRect();
  return r.width >= minW && r.height >= minH;
}

/** Keeps CSS transitions (transition-all etc.) from fighting a running tween. */
function guardTransition(el: HTMLElement) {
  return {
    onStart: () => {
      el.style.transition = "none";
    },
    onComplete: () => {
      el.style.transition = "";
    },
    onReverseComplete: () => {
      el.style.transition = "";
    },
  };
}

/** Split a plain-text heading into word masks, restoring the same text node after. */
function splitWords(el: HTMLElement): { words: HTMLElement[]; restore: Restore } | null {
  if (el.children.length > 0 || el.childNodes.length !== 1) return null;
  const textNode = el.firstChild;
  if (!textNode || textNode.nodeType !== Node.TEXT_NODE) return null;
  const text = textNode.nodeValue ?? "";
  if (!text.trim()) return null;

  const frag = document.createDocumentFragment();
  const words: HTMLElement[] = [];
  text.split(/(\s+)/).forEach((part) => {
    if (!part) return;
    if (/^\s+$/.test(part)) {
      frag.appendChild(document.createTextNode(" "));
      return;
    }
    const mask = document.createElement("span");
    mask.style.cssText = "display:inline-block;overflow:hidden;vertical-align:top;padding-bottom:.12em;margin-bottom:-.12em";
    mask.setAttribute("data-motion-split", "");
    const inner = document.createElement("span");
    inner.style.cssText = "display:inline-block;will-change:transform";
    inner.textContent = part;
    mask.appendChild(inner);
    frag.appendChild(mask);
    words.push(inner);
  });
  el.replaceChildren(frag);
  el.setAttribute("aria-label", text);
  return {
    words,
    restore: () => {
      if (el.isConnected || el.parentNode) el.replaceChildren(textNode);
      el.removeAttribute("aria-label");
    },
  };
}

/* -------------------------------------------------------------------------- */
/*  Page animation (scroll reveals, slide in/out, parallax, counters)          */
/* -------------------------------------------------------------------------- */

function buildPageMotion(root: HTMLElement, mobile: boolean, baseDelay: number): Restore {
  const restores: Restore[] = [];
  const dist = mobile ? 36 : 70;
  const slide = mobile ? 0 : 90;
  const start = mobile ? "top 94%" : "top 88%";
  const toggle = "play none none reverse";

  /* ---- Phase 1: read the DOM (no writes) ---- */
  const containers = Array.from(root.querySelectorAll("div, ul, ol, section, nav")).filter(
    (el) => el.children.length >= 2 && usable(el),
  ) as HTMLElement[];

  const claimed = new Set<Element>(); // items/columns that animate as a unit
  const ancestorsOfClaimed = new Set<Element>();
  const splits: { left: HTMLElement; right: HTMLElement; stacked: boolean }[] = [];
  const groups: HTMLElement[][] = [];

  const claim = (el: HTMLElement) => {
    claimed.add(el);
    for (let n: Element | null = el.parentElement; n && n !== root; n = n.parentElement) {
      ancestorsOfClaimed.add(n);
    }
  };

  // Innermost first, so inner grids claim before the wrappers around them.
  for (let i = containers.length - 1; i >= 0; i--) {
    const c = containers[i];
    const cs = getComputedStyle(c);
    const isGrid = cs.display === "grid" || cs.display === "inline-grid";
    const isFlex = cs.display === "flex" || cs.display === "inline-flex";
    if (!isGrid && !isFlex) continue;

    const kids = Array.from(c.children).filter(
      (k): k is HTMLElement => k instanceof HTMLElement && usable(k) && hasSize(k, 40, 40),
    );
    if (kids.length < 2 || kids.some((k) => claimed.has(k))) continue;

    if (kids.length === 2 && kids.every((k) => hasSize(k, 120, 80))) {
      const [a, b] = kids;
      const ra = a.getBoundingClientRect();
      const rb = b.getBoundingClientRect();
      splits.push({ left: a, right: b, stacked: rb.top >= ra.bottom - 4 });
      claim(a);
      claim(b);
      continue;
    }

    const wrapsRow = isGrid || cs.flexWrap !== "nowrap" || cs.flexDirection.startsWith("row");
    const cardLike = kids.every((k) => hasSize(k, 90, 56));
    const tooBig = kids.some((k) => k.getBoundingClientRect().height > window.innerHeight * 1.4);
    const innerClaimed = kids.some((k) => ancestorsOfClaimed.has(k));
    if (kids.length <= 40 && cardLike && !tooBig && !innerClaimed && (wrapsRow || kids.length >= 3)) {
      groups.push(kids);
      kids.forEach(claim);
    }
  }

  const blocked = (el: Element) => isInside(el, claimed);

  const groupItems = new Set<Element>(groups.flat());
  const headings = (Array.from(root.querySelectorAll("h1, h2, h3")) as HTMLElement[]).filter(
    (h) => usable(h) && hasSize(h) && !isInside(h, groupItems),
  );

  const texts = (Array.from(root.querySelectorAll("p, h4, h5, h6")) as HTMLElement[]).filter(
    (p) => usable(p) && hasSize(p) && !blocked(p),
  );

  const buttons = (
    Array.from(root.querySelectorAll('a[class*="rounded-full"], a[class*="rounded-xl"], button[class*="rounded"]')) as HTMLElement[]
  ).filter((b) => usable(b) && hasSize(b) && !blocked(b) && !b.closest("p, h1, h2, h3, h4"));

  const imgs = (Array.from(root.querySelectorAll("img")) as HTMLImageElement[]).filter(
    (img) => usable(img) && hasSize(img, 80, 80),
  );
  const parallaxImgs: { img: HTMLImageElement; wrap: HTMLElement }[] = [];
  const revealImgs: HTMLImageElement[] = [];
  for (const img of imgs) {
    let wrap: HTMLElement | null = null;
    for (let n: HTMLElement | null = img.parentElement, depth = 0; n && depth < 2; n = n.parentElement, depth++) {
      const ov = getComputedStyle(n).overflow;
      if ((ov === "hidden" || ov === "clip") && hasSize(n, 200, 180)) {
        wrap = n;
        break;
      }
    }
    if (wrap) {
      parallaxImgs.push({ img, wrap });
    } else if (!blocked(img)) {
      revealImgs.push(img);
    }
  }

  const counters: { node: Text; prefix: string; value: number; suffix: string; decimals: number; original: string }[] = [];
  for (const el of Array.from(root.querySelectorAll("span, p, div, strong, b, h2, h3, h4, dd, td"))) {
    if (!usable(el) || el.children.length > 0 || el.childNodes.length !== 1) continue;
    const node = el.firstChild;
    if (!node || node.nodeType !== Node.TEXT_NODE) continue;
    const raw = (node.nodeValue ?? "").trim();
    if (raw.length > 14 || !hasSize(el)) continue;
    const m = COUNTER_RE.exec(raw);
    if (!m) continue;
    const [, prefix, num, suffix] = m;
    if (/^0\d/.test(num)) continue;
    const value = parseFloat(num.replace(/,/g, ""));
    if (!Number.isFinite(value) || (value < 10 && !suffix && !prefix)) continue;
    counters.push({
      node: node as Text,
      prefix,
      value,
      suffix,
      decimals: num.includes(".") ? num.split(".")[1].length : 0,
      original: node.nodeValue ?? "",
    });
  }

  /* ---- Phase 2: write ---- */

  // Slide-in / slide-out columns
  splits.forEach(({ left, right, stacked }) => {
    const useX = !stacked && slide > 0;
    const sides: [HTMLElement, number][] = [
      [left, -1],
      [right, 1],
    ];
    sides.forEach(([node, dir], idx) => {
      gsap.fromTo(
        node,
        { opacity: 0, x: useX ? dir * slide : 0, y: useX ? 0 : dist * 0.8 },
        {
          opacity: 1,
          x: 0,
          y: 0,
          duration: 1.05,
          delay: baseDelay + idx * 0.12,
          ease: "power3.out",
          ...guardTransition(node),
          scrollTrigger: { trigger: node, start, toggleActions: toggle },
        },
      );
    });
  });

  // Staggered card groups
  groups.forEach((kids) => {
    kids.forEach((k) => {
      k.classList.add("xyvoo-lift");
      k.style.transition = "none";
    });
    gsap.set(kids, { opacity: 0, y: dist * 0.8, scale: 0.96 });
    ScrollTrigger.batch(kids, {
      start,
      interval: 0.1,
      batchMax: mobile ? 2 : 4,
      onEnter: (batch) =>
        gsap.to(batch, {
          opacity: 1,
          y: 0,
          scale: 1,
          duration: 0.85,
          delay: baseDelay,
          stagger: { each: 0.09, from: "start" },
          ease: "power3.out",
          overwrite: true,
          onComplete: () => batch.forEach((b) => ((b as HTMLElement).style.transition = "")),
        }),
      onLeaveBack: (batch) =>
        gsap.to(batch, {
          opacity: 0,
          y: dist * 0.8,
          scale: 0.96,
          duration: 0.45,
          stagger: 0.04,
          ease: "power2.in",
          overwrite: true,
          onStart: () => batch.forEach((b) => ((b as HTMLElement).style.transition = "none")),
        }),
    });
  });

  // Headings: word-by-word mask reveal (falls back to a rise for rich headings)
  headings.forEach((h) => {
    const split = splitWords(h);
    if (split) {
      restores.push(split.restore);
      gsap.fromTo(
        split.words,
        { yPercent: 115, rotate: mobile ? 2 : 4 },
        {
          yPercent: 0,
          rotate: 0,
          duration: 0.95,
          delay: baseDelay,
          stagger: mobile ? 0.04 : 0.055,
          ease: "power4.out",
          scrollTrigger: { trigger: h, start, toggleActions: toggle },
        },
      );
    } else {
      gsap.fromTo(
        h,
        { opacity: 0, y: dist * 0.7 },
        {
          opacity: 1,
          y: 0,
          duration: 0.95,
          delay: baseDelay,
          ...guardTransition(h),
          scrollTrigger: { trigger: h, start, toggleActions: toggle },
        },
      );
    }
  });

  // Body copy
  texts.forEach((p) => {
    gsap.fromTo(
      p,
      { opacity: 0, y: dist * 0.5 },
      {
        opacity: 1,
        y: 0,
        duration: 0.85,
        delay: baseDelay + 0.1,
        ...guardTransition(p),
        scrollTrigger: { trigger: p, start, toggleActions: toggle },
      },
    );
  });

  // Buttons and CTAs: pop up with a little overshoot
  buttons.forEach((b) => {
    gsap.fromTo(
      b,
      { opacity: 0, y: 24, scale: 0.92 },
      {
        opacity: 1,
        y: 0,
        scale: 1,
        duration: 0.75,
        delay: baseDelay + 0.2,
        ease: "back.out(1.6)",
        ...guardTransition(b),
        scrollTrigger: { trigger: b, start, toggleActions: toggle },
      },
    );
  });

  // Images inside clipped frames: parallax drift
  parallaxImgs.forEach(({ img, wrap }) => {
    gsap.fromTo(
      img,
      { yPercent: mobile ? -4 : -7, scale: mobile ? 1.08 : 1.14 },
      {
        yPercent: mobile ? 4 : 7,
        scale: mobile ? 1.08 : 1.14,
        ease: "none",
        scrollTrigger: { trigger: wrap, start: "top bottom", end: "bottom top", scrub: 0.6 },
      },
    );
  });

  // Free images: scale-and-rise
  revealImgs.forEach((img) => {
    gsap.fromTo(
      img,
      { opacity: 0, scale: 0.92, y: dist * 0.6 },
      {
        opacity: 1,
        scale: 1,
        y: 0,
        duration: 1.1,
        delay: baseDelay,
        ...guardTransition(img),
        scrollTrigger: { trigger: img, start, toggleActions: toggle },
      },
    );
  });

  // Number counters
  counters.forEach((c) => {
    const state = { v: 0 };
    const fmt = (n: number) =>
      c.prefix +
      n.toLocaleString("en-US", {
        minimumFractionDigits: c.decimals,
        maximumFractionDigits: c.decimals,
        useGrouping: c.original.includes(","),
      }) +
      c.suffix;
    c.node.nodeValue = fmt(0);
    restores.push(() => {
      c.node.nodeValue = c.original;
    });
    gsap.to(state, {
      v: c.value,
      duration: 1.8,
      delay: baseDelay,
      ease: "power2.out",
      onUpdate: () => {
        c.node.nodeValue = fmt(state.v);
      },
      onComplete: () => {
        c.node.nodeValue = c.original;
      },
      scrollTrigger: { trigger: c.node.parentElement as Element, start, once: true },
    });
  });

  // Fonts/images shift layout after first paint: re-measure trigger positions.
  const refresh = () => ScrollTrigger.refresh();
  const t = window.setTimeout(refresh, 400);
  window.addEventListener("load", refresh);
  document.fonts?.ready.then(refresh).catch(() => undefined);
  let resizeTimer: number | undefined;
  const ro = new ResizeObserver(() => {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(refresh, 250);
  });
  ro.observe(root);

  // ScrollTriggers/tweens made above are reverted by the matchMedia context;
  // this only undoes what GSAP can't (observers, DOM edits, batch callbacks).
  return () => {
    window.clearTimeout(t);
    window.clearTimeout(resizeTimer);
    window.removeEventListener("load", refresh);
    ro.disconnect();
    restores.forEach((r) => r());
    groups.flat().forEach((k) => {
      gsap.killTweensOf(k);
      gsap.set(k, { clearProps: "opacity,transform" });
      k.style.transition = "";
      k.classList.remove("xyvoo-lift");
    });
  };
}

/* -------------------------------------------------------------------------- */
/*  Component                                                                  */
/* -------------------------------------------------------------------------- */

function applyCurtainTheme(curtain: HTMLElement, theme: CurtainTheme) {
  const c = CURTAIN_COLORS[theme];
  const q = (sel: string) => curtain.querySelector(sel) as HTMLElement | null;
  const panels = curtain.querySelectorAll<HTMLElement>("[data-panel]");
  if (panels[0]) panels[0].style.background = c.accent;
  if (panels[1]) panels[1].style.background = c.bg;
  const glow = q("[data-glow]");
  if (glow) glow.style.background = `radial-gradient(circle, ${c.glow}, transparent 65%)`;
  const bar = q("[data-bar]");
  if (bar) bar.style.background = c.bar;
  const track = q("[data-track]");
  if (track) track.style.background = c.dark ? "rgba(255,255,255,0.12)" : "rgba(7,22,44,0.1)";
  const word = q("[data-word]");
  if (word) {
    word.textContent = curtainWord;
    word.style.color = c.dark ? "rgba(255,255,255,0.07)" : "rgba(7,22,44,0.06)";
  }
  const caption = q("[data-caption]");
  if (caption) {
    caption.textContent = `Taking you to ${curtainWord === "xyvoo" ? "XYVOO" : curtainWord}`;
    caption.style.color = c.dark ? "rgba(255,255,255,0.55)" : "rgba(7,22,44,0.5)";
  }
  const onDark = q("[data-logo-on-dark]");
  const onLight = q("[data-logo-on-light]");
  if (onDark) onDark.style.display = c.dark ? "block" : "none";
  if (onLight) onLight.style.display = c.dark ? "none" : "block";
}

export function SiteMotion() {
  const pathname = usePathname();
  const router = useRouter();
  const curtainRef = useRef<HTMLDivElement>(null);
  const navigatingRef = useRef(false);
  const fallbackRef = useRef<number | undefined>(undefined);

  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, { stiffness: 140, damping: 28, mass: 0.4 });

  /* Per-route page animation, rebuilt per breakpoint and torn down on change. */
  useIsoLayoutEffect(() => {
    const main = document.getElementById("main-content");
    const root = (main?.parentElement as HTMLElement | null) ?? null;
    if (!root) return;

    const baseDelay = navigatingRef.current || curtainPending ? 0.5 : 0.05;
    const mm = gsap.matchMedia();
    mm.add(
      {
        desktop: "(min-width: 768px) and (prefers-reduced-motion: no-preference)",
        mobile: "(max-width: 767px) and (prefers-reduced-motion: no-preference)",
      },
      (ctx) => {
        const mobile = !!ctx.conditions?.mobile;
        return buildPageMotion(root, mobile, baseDelay);
      },
    );
    return () => mm.revert();
  }, [pathname]);

  /* Header intro, once per full page load. */
  useIsoLayoutEffect(() => {
    if (headerIntroPlayed) return;
    headerIntroPlayed = true;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const bar = document.querySelector("header > div") as HTMLElement | null;
    const logo = document.querySelector("header a[href='/']") as HTMLElement | null;
    const navItems = Array.from(document.querySelectorAll("header nav > *")) as HTMLElement[];
    const right = document.querySelector("header .shrink-0.items-center.gap-2") as HTMLElement | null;
    const tl = gsap.timeline({ defaults: { ease: "power3.out" } });
    if (bar) tl.from(bar, { y: -28, opacity: 0, duration: 0.8 }, 0);
    if (logo) tl.from(logo, { x: -24, opacity: 0, duration: 0.8 }, 0.1);
    if (navItems.length) {
      navItems.forEach((n) => (n.style.transition = "none"));
      tl.from(navItems, { y: -16, opacity: 0, duration: 0.6, stagger: 0.07 }, 0.2).add(
        () => navItems.forEach((n) => ((n.style.transition = ""), gsap.set(n, { clearProps: "all" }))),
      );
    }
    if (right) tl.from(right, { x: 24, opacity: 0, duration: 0.8 }, 0.25);
  }, []);

  /* Curtain: reveal after a route change (or remount from another layout). */
  useIsoLayoutEffect(() => {
    const curtain = curtainRef.current;
    if (!curtain) return;
    const panels = curtain.querySelectorAll("[data-panel]");
    const logo = curtain.querySelector("[data-logo]");
    const bar = curtain.querySelector("[data-bar]");
    const glow = curtain.querySelector("[data-glow]");
    const word = curtain.querySelector("[data-word]");
    const shield = curtain.querySelector("[data-shield]");
    const caption = curtain.querySelector("[data-caption]");
    if (!navigatingRef.current && !curtainPending) return;

    navigatingRef.current = false;
    curtainPending = false;
    window.clearTimeout(fallbackRef.current);

    applyCurtainTheme(curtain, curtainTheme);
    gsap.killTweensOf([logo, bar, glow, word, shield, caption]);
    gsap.set(curtain, { autoAlpha: 1, pointerEvents: "auto" });
    gsap.set(panels, { yPercent: 0 });
    gsap.set(shield, { opacity: 0 });
    gsap.set(word, { opacity: 1, x: 0 });
    gsap.set(caption, { opacity: 1 });
    gsap.set(logo, { scale: 1, opacity: 1, clipPath: "inset(0 0% 0 0)" });
    gsap
      .timeline({ delay: 0.05 })
      .to(bar, { scaleX: 1, duration: 0.35, ease: "power2.out", overwrite: true })
      .to(logo, { scale: 1.12, opacity: 0, duration: 0.4, ease: "power2.in" }, "+=0.05")
      .to(glow, { scale: 1.8, opacity: 0, duration: 0.5, ease: "power2.in" }, "<")
      .to([word, caption], { opacity: 0, duration: 0.3, ease: "power2.in" }, "<")
      .to(panels, { yPercent: -100, duration: 0.7, stagger: 0.08, ease: "power4.inOut" }, "-=0.2")
      .set(curtain, { autoAlpha: 0, pointerEvents: "none" });
  }, [pathname]);

  /* Intercept internal link clicks to run the cover animation first. */
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      if (a.closest("[data-motion='off']")) return;

      let url: URL;
      try {
        url = new URL(a.href, window.location.href);
      } catch {
        return;
      }
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname) return; // hash / query only
      if (/\.[a-z0-9]{2,5}$/i.test(url.pathname)) return; // files
      if (NO_CURTAIN_PREFIXES.some((p) => url.pathname === p || url.pathname.startsWith(p + "/"))) return;
      if (navigatingRef.current) {
        e.preventDefault();
        return;
      }

      const curtain = curtainRef.current;
      if (!curtain) return;
      e.preventDefault();
      e.stopPropagation();
      navigatingRef.current = true;
      curtainPending = true;

      const panels = curtain.querySelectorAll("[data-panel]");
      const logo = curtain.querySelector("[data-logo]");
      const shine = curtain.querySelector("[data-shine]");
      const bar = curtain.querySelector("[data-bar]");
      const glow = curtain.querySelector("[data-glow]");
      const word = curtain.querySelector("[data-word]");
      const shield = curtain.querySelector("[data-shield]");
      const caption = curtain.querySelector("[data-caption]");
      const href = url.pathname + url.search + url.hash;

      curtainTheme = curtainThemeFor(url.pathname);
      curtainWord = curtainWordFor(url.pathname);
      applyCurtainTheme(curtain, curtainTheme);

      // The shield rolls in from the right like a ball: distance / radius gives
      // the turn, negative because it rolls leftwards (anticlockwise).
      const startX = Math.round(window.innerWidth * 0.55) + 80;
      const turn = -(startX / 44) * (180 / Math.PI);

      gsap.killTweensOf([logo, shine, bar, glow, word, shield, caption]);
      gsap
        .timeline()
        .set(curtain, { autoAlpha: 1, pointerEvents: "auto" })
        .set(logo, { scale: 0.85, opacity: 0, clipPath: "inset(0 100% 0 0)" })
        .set(shield, { x: startX, rotation: 0, scale: 1, opacity: 1 })
        .set(bar, { scaleX: 0 })
        .set(shine, { xPercent: -120 })
        .set(glow, { scale: 0.6, opacity: 0 })
        .set(word, { opacity: 0, x: 90 })
        .set(caption, { opacity: 0, y: 8 })
        .fromTo(panels, { yPercent: 100 }, { yPercent: 0, duration: 0.6, stagger: 0.08, ease: "power4.inOut" })
        .to(word, { opacity: 1, x: 0, duration: 1.1, ease: "power3.out" }, "-=0.35")
        .to(glow, { scale: 1, opacity: 1, duration: 0.7, ease: "power2.out" }, "<")
        .to(shield, { x: 0, rotation: turn, duration: 1.05, ease: "power2.out" }, "<0.1")
        .to(bar, { scaleX: 0.85, duration: 1.6, ease: "power1.out" }, "<")
        .to(caption, { opacity: 1, y: 0, duration: 0.5, ease: "power2.out" }, "<0.4")
        // The ball arrives, then turns into the full logo.
        .to(shield, { scale: 0.55, opacity: 0, duration: 0.28, ease: "power2.in" }, ">-0.05")
        .to(logo, { opacity: 1, scale: 1, clipPath: "inset(0 0% 0 0)", duration: 0.7, ease: "power3.out" }, "<0.08")
        .to(shine, { xPercent: 160, duration: 0.8, ease: "power2.inOut" }, "-=0.3")
        .add(() => router.push(href), "-=0.35");
      // Gentle breathing glow while we wait for the next page.
      gsap.to(glow, { scale: 1.12, duration: 1.2, ease: "sine.inOut", yoyo: true, repeat: -1, delay: 2 });

      // If the route never changes (error / slow server), don't strand the user.
      fallbackRef.current = window.setTimeout(() => {
        if (!navigatingRef.current) return;
        navigatingRef.current = false;
        curtainPending = false;
        gsap
          .timeline()
          .to(panels, { yPercent: -100, duration: 0.6, stagger: 0.06, ease: "power4.inOut" })
          .set(curtain, { autoAlpha: 0, pointerEvents: "none" });
      }, 5000);
    };

    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [router]);

  useEffect(() => () => window.clearTimeout(fallbackRef.current), []);

  return (
    <>
      <motion.div
        aria-hidden
        data-motion="off"
        className="pointer-events-none fixed inset-x-0 top-0 z-[60] h-[3px] origin-left bg-gradient-to-r from-[#1565c0] via-[#4dd0c4] to-[#90caf9]"
        style={{ scaleX }}
      />
      <div
        ref={curtainRef}
        aria-hidden
        data-motion="off"
        className="pointer-events-none invisible fixed inset-0 z-[90] overflow-hidden"
      >
        <div data-panel className="absolute inset-0 bg-[#1565c0]" />
        <div data-panel className="absolute inset-0 flex items-center justify-center bg-[#000d1f]">
          <span
            data-word
            aria-hidden
            className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-[58%] select-none whitespace-nowrap font-[family-name:var(--font-fraunces)] text-[34vw] font-normal italic lowercase leading-none tracking-tight opacity-0 lg:text-[22vw]"
          />
          <div data-glow className="absolute size-[560px] max-w-[140vw] rounded-full opacity-0" />
          <div className="relative flex flex-col items-center gap-8">
            <div className="relative">
            <div data-logo className="relative overflow-hidden">
              <Image
                data-logo-on-light
                src={LOGO_URL}
                alt=""
                width={320}
                height={128}
                loading="eager"
                className="h-24 w-auto sm:h-28"
                style={{ display: "none" }}
              />
              <Image
                data-logo-on-dark
                src={LOGO_LIGHT_URL}
                alt=""
                width={320}
                height={128}
                loading="eager"
                className="h-24 w-auto sm:h-28"
              />
              <div
                data-shine
                className="pointer-events-none absolute inset-y-0 -left-1/3 w-1/3 -skew-x-12 bg-gradient-to-r from-transparent via-white/60 to-transparent mix-blend-overlay"
              />
            </div>
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <Image
                  data-shield
                  src="/images/XYVOO%20Shield.png"
                  alt=""
                  width={96}
                  height={96}
                  loading="eager"
                  className="size-20 sm:size-24"
                  style={{ opacity: 0 }}
                />
              </div>
            </div>
            <p data-caption className="text-xs font-semibold uppercase tracking-[0.28em] opacity-0" />
            <div data-track className="h-[3px] w-40 overflow-hidden rounded-full">
              <div data-bar className="h-full w-full origin-left rounded-full" style={{ transform: "scaleX(0)" }} />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

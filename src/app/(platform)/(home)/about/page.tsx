"use client";

import Link from "next/link";
import Image from "next/image";
import { Fragment, useEffect, useRef, useState } from "react";
import { motion, useScroll, useTransform, type Variants } from "framer-motion";
import { ArrowRight, ArrowUpRight, BedDouble, ShoppingBag, ShieldCheck } from "lucide-react";
import { SectionEyebrow } from "@/components/website/SectionEyebrow";
import { HeroWatermark } from "@/components/website/HeroWatermark";
import {
  ABOUT_HERO,
  ABOUT_WHO_WE_ARE,
  ABOUT_WHO_POINTS,
  ABOUT_PLATFORMS_INTRO,
  ABOUT_BUILD_TOP_CARDS,
  ABOUT_BUILD_BOTTOM_CARDS,
  ABOUT_HOW_IT_WORKS,
} from "@/constants/about";

const BUILD_TOP_ICONS: Record<string, typeof BedDouble> = {
  hms: BedDouble,
  storefront: ShoppingBag,
  "white-label": ShieldCheck,
};
/** Exact colors used on each solution page's own hero — /solution/hms is
 * bg-[#000d1f] (= var(--xyvoo-navy)), /solution/storefront is bg-[#04140f].
 * The third, non-product card uses the company blue instead. */
const BUILD_TOP_ICON_BG: Record<string, string> = {
  hms: "var(--xyvoo-navy)",
  storefront: "#04140f",
  "white-label": "var(--xyvoo-blue)",
};

const fadeUp: Variants = {
  offscreen: { opacity: 0, y: 32 },
  onscreen: { opacity: 1, y: 0, transition: { duration: 0.65, ease: "easeOut" } },
};

type AboutPlatformLink = {
  title: string;
  description: string;
  actionLabel: string;
  href: string;
};

const ABOUT_PLATFORM_LINKS: AboutPlatformLink[] = [
  {
    title: "XYVOO HMS",
    description: "Front desk, housekeeping, F&B, billing and reporting in one system, fully under your brand.",
    actionLabel: "Explore HMS",
    href: "/solution/hms",
  },
  {
    title: "XYVOO Storefront",
    description: "Catalogue, checkout and fulfilment, live in minutes and fully under your brand.",
    actionLabel: "Explore Storefront",
    href: "/solution/storefront",
  },
];

export default function AboutPage() {
  // Scroll-linked image swap: the HMS image slides up and out around the middle of the
  // section while the Storefront image slides up into its place. Desktop only.
  const beliefRef = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: beliefRef, offset: ["start start", "end end"] });
  const hmsY = useTransform(scrollYProgress, [0.4, 0.6], ["0%", "-105%"]);
  const storeY = useTransform(scrollYProgress, [0.4, 0.6], ["105%", "0%"]);
  const [tier, setTier] = useState<"phone" | "tablet" | "desktop" | null>(null);
  const isDesktop = tier === "desktop";
  useEffect(() => {
    const phone = window.matchMedia("(max-width: 767px)");
    const desktop = window.matchMedia("(min-width: 1024px)");
    const update = () => setTier(phone.matches ? "phone" : desktop.matches ? "desktop" : "tablet");
    update();
    phone.addEventListener("change", update);
    desktop.addEventListener("change", update);
    return () => {
      phone.removeEventListener("change", update);
      desktop.removeEventListener("change", update);
    };
  }, []);

  // Phones only: items slide in from alternating sides as they enter the screen and slide
  // back out when they leave it. Nothing is applied until we know we're on a phone, so
  // tablet and desktop content is never left hidden.
  const slide = (from: "left" | "right") =>
    tier === "phone"
      ? {
          initial: { opacity: 0, x: from === "left" ? -56 : 56 },
          whileInView: { opacity: 1, x: 0 },
          // Fires as the item's top edge crosses a line just above the bottom of the screen,
          // so each one slides in on its own as it arrives, not several at once.
          viewport: { once: false, amount: "some" as const, margin: "0px 0px -18% 0px" },
          transition: { duration: 0.45, ease: "easeOut" as const },
        }
      : {};

  return (
    <>
      {/* Hero — dense split layout, matching the Contact page hero */}
      <section
        className="relative isolate overflow-hidden bg-white px-6 pt-36 pb-20 md:px-12 md:pb-24 lg:px-6 border-b border-slate-100"
        style={{
          // Same grid-line texture as the Company tab of the home hero.
          backgroundImage:
            "linear-gradient(to right, rgba(7, 22, 44, 0.04) 1px, transparent 1px), linear-gradient(to bottom, rgba(7, 22, 44, 0.04) 1px, transparent 1px)",
          backgroundSize: "40px 40px",
        }}
      >
        <HeroWatermark text="story" />
        <div
          className="pointer-events-none absolute -top-16 right-[8%] z-0 h-[360px] w-[360px] rounded-full blur-[100px]"
          style={{ background: "rgb(var(--xyvoo-blue-rgb) / 0.24)" }}
          aria-hidden
        />
        <div className="relative z-10 mx-auto grid max-w-[1200px] grid-cols-1 gap-14 lg:grid-cols-[1.15fr_0.85fr] lg:items-end">
          <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.55, ease: "easeOut" }}>
            <p className="mb-5 text-eyebrow font-bold uppercase tracking-[0.22em] text-xyvoo-blue">
              {ABOUT_HERO.eyebrow}
            </p>
            <h1 className="whitespace-pre-line text-balance text-h1 font-black leading-[1.08] tracking-tight text-xyvoo-navy">
              One company. <span className="text-xyvoo-blue">Two platforms.</span>
              {"\n"}Software that runs your business.
            </h1>
            <p className="mt-6 max-w-md text-p leading-relaxed text-slate-500">
              {ABOUT_HERO.subtitle}
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.1, ease: "easeOut" }}
            className="border-t border-slate-200"
          >
            {ABOUT_PLATFORM_LINKS.map((link) => (
              <Link key={link.title} href={link.href} className="group block border-b border-slate-200 py-7 first:pt-0">
                <div className="flex items-baseline justify-between gap-4">
                  <h3 className="text-lg font-bold text-xyvoo-navy">{link.title}</h3>
                  <span className="inline-flex shrink-0 items-center gap-1 text-xs font-bold uppercase tracking-wider text-xyvoo-blue transition-colors group-hover:text-xyvoo-navy">
                    {link.actionLabel}
                    <ArrowUpRight className="h-3 w-3" />
                  </span>
                </div>
                <p className="mt-2 max-w-sm text-sm leading-relaxed text-slate-500">{link.description}</p>
              </Link>
            ))}
          </motion.div>
        </div>
      </section>

      {/* What we believe — heading and image stay pinned while the points scroll on the left; image bleeds to the screen's right edge */}
      <section ref={beliefRef} className="overflow-x-clip bg-slate-50 py-20 pl-6 md:pl-12 lg:py-28 lg:pt-4 lg:pl-[max(1.5rem,calc((100%-1200px)/2))]">
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-[0.8fr_1.2fr] lg:gap-10">
          <div className="pr-6 md:pr-12 lg:pr-0">
            <motion.div
              initial="offscreen"
              whileInView="onscreen"
              viewport={{ once: true }}
              variants={fadeUp}
              className="z-10 bg-slate-50 pb-6 lg:sticky lg:top-0 lg:pt-24"
            >
              <p className="mb-3 text-eyebrow font-bold uppercase tracking-widest text-xyvoo-blue">{ABOUT_WHO_WE_ARE.eyebrow}</p>
              <h3 className="mb-4 text-h3 font-black leading-tight text-xyvoo-navy">{ABOUT_WHO_WE_ARE.title}</h3>
              <p className="md:max-w-none lg:max-w-[42ch] text-p leading-relaxed text-slate-500">{ABOUT_WHO_WE_ARE.intro}</p>
            </motion.div>

            <ul className="mt-6 flex flex-col">
              {ABOUT_WHO_POINTS.map((point, i) => (
                <Fragment key={`${point.title}-${tier === "phone"}`}>
                  <motion.li {...slide(i % 2 ? "right" : "left")} className="group border-t border-slate-200 py-8 lg:py-10">
                    <span className="mb-2 block font-mono text-sm font-semibold tracking-wide text-xyvoo-navy/30 transition-colors duration-300 group-hover:text-xyvoo-blue">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <h5 className="text-h5 font-semibold leading-snug text-xyvoo-navy transition-colors duration-300 group-hover:text-xyvoo-blue">
                      {point.title}
                    </h5>
                    <p className="mt-2 md:max-w-none lg:max-w-[46ch] text-p leading-relaxed text-slate-500">{point.description}</p>
                  </motion.li>
                  {/* Phones only: the images sit inline, one after the first three points and one after the last three. */}
                  {i === 2 ? (
                    <motion.li {...slide("right")} className="-mr-6 md:-mr-12 border-t border-slate-200 py-8 lg:hidden" aria-hidden>
                      <Image
                        src="/images/about/HMS Dashboard Devices on Blue Shape.png"
                        alt=""
                        width={1413}
                        height={1113}
                        sizes="100vw"
                        className="h-auto w-full"
                      />
                    </motion.li>
                  ) : null}
                  {i === ABOUT_WHO_POINTS.length - 1 ? (
                    <motion.li {...slide("left")} className="-mr-6 md:-mr-12 border-t border-slate-200 py-8 lg:hidden" aria-hidden>
                      <Image
                        src="/images/about/Analytics Dashboard Device Mockup.png"
                        alt=""
                        width={1721}
                        height={914}
                        sizes="100vw"
                        className="h-auto w-full"
                      />
                    </motion.li>
                  ) : null}
                </Fragment>
              ))}
            </ul>
          </div>

          <div className="hidden lg:sticky lg:top-28 lg:block lg:self-start">
            <motion.div
              initial={{ opacity: 0, x: 40 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.7, ease: "easeOut" }}
              className="relative flex flex-col gap-10 lg:block lg:h-[calc(100vh-8rem)] lg:max-h-[720px] lg:overflow-hidden"
            >
              <motion.div style={isDesktop ? { y: hmsY } : undefined} className="lg:absolute lg:inset-0">
                <Image
                  src="/images/about/HMS Dashboard Devices on Blue Shape.png"
                  alt="The XYVOO HMS dashboard shown on a laptop and a phone"
                  width={1413}
                  height={1113}
                  sizes="(min-width: 1024px) 60vw, 100vw"
                  className="h-auto w-full lg:h-full lg:object-contain lg:object-right"
                />
              </motion.div>
              <motion.div style={isDesktop ? { y: storeY } : undefined} className="lg:absolute lg:inset-0">
                <Image
                  src="/images/about/Analytics Dashboard Device Mockup.png"
                  alt="The XYVOO Storefront analytics dashboard shown on a laptop and a phone"
                  width={1721}
                  height={914}
                  sizes="(min-width: 1024px) 60vw, 100vw"
                  className="h-auto w-full lg:h-full lg:object-contain lg:object-right"
                />
              </motion.div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* What we build — 5-card wave grid: 3 colored cards + 2 plain cards, matching the pattern used elsewhere on the site */}
      <section id="platforms" className="bg-white px-6 py-20 md:py-28">
        <div className="mx-auto max-w-[1200px]">
          <motion.div initial="offscreen" whileInView="onscreen" viewport={{ once: true }} variants={fadeUp} className="mb-14 text-center md:mb-16">
            <SectionEyebrow
              eyebrow={ABOUT_PLATFORMS_INTRO.eyebrow}
              title={ABOUT_PLATFORMS_INTRO.title}
              className="mx-auto max-w-2xl [&>p]:justify-center"
              eyebrowClassName="flex items-center justify-center"
              titleClassName="text-h3 font-extrabold"
            />
            <p className="mx-auto mt-5 max-w-2xl text-[16px] leading-[1.75] text-xyvoo-navy/65">
              {ABOUT_PLATFORMS_INTRO.subtitle}
            </p>
          </motion.div>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            {ABOUT_BUILD_TOP_CARDS.map(({ id, title, description, linkLabel, linkHref }, index) => {
              const Icon = BUILD_TOP_ICONS[id];
              return (
                <motion.div key={id} initial="offscreen" whileInView="onscreen" viewport={{ once: true }} variants={fadeUp} transition={{ delay: index * 0.08 }}>
                  <div className="flex h-full flex-col overflow-hidden rounded-none rounded-tr-[48px] border border-slate-100 bg-white shadow-[0_16px_36px_rgba(0,13,31,0.06)]">
                    <div
                      className="relative flex items-center gap-3 overflow-hidden px-6 py-6"
                      style={{ background: BUILD_TOP_ICON_BG[id] }}
                    >
                      <div className="absolute inset-0 pointer-events-none z-0 opacity-15">
                        <svg className="absolute inset-0 w-full h-full" viewBox="0 0 300 100" preserveAspectRatio="none" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path d="M-20,60 C60,20 120,80 200,50 C260,25 320,65 350,50 L350,120 L-20,120 Z" fill="white" opacity="0.3" />
                          <path d="M-20,75 C80,45 140,95 220,65 C280,40 310,75 350,65 L350,120 L-20,120 Z" fill="white" opacity="0.5" />
                        </svg>
                      </div>
                      <div className="relative z-10 flex h-[52px] w-[52px] shrink-0 items-center justify-center">
                        <Icon className="h-6 w-6 text-white" aria-hidden />
                      </div>
                      <h3 className="relative z-10 text-[17px] font-extrabold leading-[1.25] text-white">{title}</h3>
                    </div>
                    <div className="flex flex-1 flex-col px-6 py-6">
                      <p className="mb-4 flex-1 text-[14.5px] leading-[1.7] text-xyvoo-navy/65">{description}</p>
                      {linkLabel && linkHref && (
                        <Link href={linkHref} className="inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-xyvoo-blue">
                          {linkLabel}
                          <ArrowRight className="h-3.5 w-3.5" />
                        </Link>
                      )}
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>

          <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2">
            {ABOUT_BUILD_BOTTOM_CARDS.map(({ title, description }, index) => (
              <motion.div key={title} initial="offscreen" whileInView="onscreen" viewport={{ once: true }} variants={fadeUp} transition={{ delay: 0.24 + index * 0.08 }}>
                <div className="h-full rounded-none rounded-tr-[48px] border border-slate-100 bg-white p-8 shadow-[0_16px_36px_rgba(0,13,31,0.06)]">
                  <h3 className="mb-3 text-[19px] font-extrabold leading-[1.2] text-xyvoo-navy">{title}</h3>
                  <p className="text-[14.5px] leading-[1.7] text-xyvoo-navy/65">{description}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works — sticky heading beside a numbered list, matching the
          solution pages' "Integrations" pattern */}
      <section className="overflow-x-clip border-t border-slate-100 bg-slate-50 px-6 md:px-12 py-20 lg:py-28 lg:pt-4 lg:pl-0 lg:pr-[max(1.5rem,calc((100%-1200px)/2))]">
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-[1.2fr_0.8fr] lg:gap-10">
          <div className="lg:order-2">
            <motion.div
              initial="offscreen"
              whileInView="onscreen"
              viewport={{ once: true }}
              variants={fadeUp}
              className="z-10 bg-slate-50 pb-6 lg:sticky lg:top-0 lg:pt-24"
            >
              <p className="mb-3 text-eyebrow font-bold uppercase tracking-widest text-xyvoo-blue">How It Works</p>
              <h3 className="mb-4 text-h3 font-black leading-tight text-xyvoo-navy">{ABOUT_HOW_IT_WORKS.title}</h3>
              <p className="md:max-w-none lg:max-w-[42ch] text-p leading-relaxed text-slate-500">{ABOUT_HOW_IT_WORKS.intro}</p>
            </motion.div>

            <ul className="mt-6 flex flex-col">
              {ABOUT_HOW_IT_WORKS.steps.map((step, i) => (
                <motion.li key={`${step.title}-${tier === "phone"}`} {...slide(i % 2 ? "right" : "left")} className="group border-t border-slate-200 py-8 lg:py-10">
                  <span className="mb-2 block font-mono text-sm font-semibold tracking-wide text-xyvoo-navy/30 transition-colors duration-300 group-hover:text-xyvoo-blue">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <h5 className="text-h5 font-semibold leading-snug text-xyvoo-navy transition-colors duration-300 group-hover:text-xyvoo-blue">
                    {step.title}
                  </h5>
                  <p className="mt-2 md:max-w-none lg:max-w-[46ch] text-p leading-relaxed text-slate-500">{step.description}</p>
                </motion.li>
              ))}
            </ul>
          </div>

          <div className="lg:order-1 lg:sticky lg:top-28 lg:self-start">
            <motion.div
              initial={{ opacity: 0, x: -40 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.7, ease: "easeOut" }}
              className="-mx-6 md:-mx-12 lg:mx-0 lg:h-[calc(100vh-8rem)] lg:max-h-[720px]"
            >
              <Image
                src="/images/about/SaaS Dashboard with Business Minifigure.png"
                alt="A LEGO minifigure in a business suit presenting the XYVOO HMS dashboard on a laptop"
                width={1451}
                height={1084}
                sizes="(min-width: 768px) 60vw, 100vw"
                className="h-auto w-full lg:h-full lg:object-contain lg:object-left"
              />
            </motion.div>
          </div>
        </div>
      </section>
    </>
  );
}


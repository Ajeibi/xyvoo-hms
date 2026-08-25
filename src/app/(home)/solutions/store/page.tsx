"use client";

import Link from "next/link";
import { motion, type Variants } from "framer-motion";
import { ArrowRight, Check } from "lucide-react";
import WebsiteLayout from "@/components/website/WebsiteLayout";
import { SectionEyebrow } from "@/components/website/SectionEyebrow";
import {
  SOLUTIONS_STORE_FEATURES,
  SOLUTIONS_STORE_HERO,
} from "@/constants/solutions-store";
import { XYVOO_AUTH_ROUTES } from "@/constants/auth-links";

const fadeUp: Variants = {
  offscreen: { opacity: 0, y: 36 },
  onscreen: {
    opacity: 1,
    y: 0,
    transition: { type: "spring", duration: 0.75, bounce: 0.18 },
  },
};

export default function SolutionsStorePage() {
  return (
    <WebsiteLayout>
      <section
        className="relative overflow-hidden border-b px-6 pb-24 pt-32"
        style={{
          background: "var(--xyvoo-store-section-bg)",
          borderColor: "rgb(var(--xyvoo-blue-rgb) / 0.18)",
        }}
      >
        <div
          className="pointer-events-none absolute left-1/2 top-1/2 h-[420px] w-[420px] -translate-x-1/2 -translate-y-1/2 rounded-full blur-[80px]"
          style={{ background: "rgb(var(--xyvoo-blue-rgb) / 0.22)" }}
          aria-hidden
        />
        <div className="relative mx-auto max-w-[920px] text-center">
          <motion.div
            initial={{ opacity: 0, y: 28 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, ease: "easeOut" }}
          >
            <p
              className="mb-4 text-[11px] font-bold uppercase tracking-[0.22em]"
              style={{ color: "var(--xyvoo-mint)" }}
            >
              {SOLUTIONS_STORE_HERO.eyebrow}
            </p>
            <h1
              className="mb-6 text-balance text-[clamp(2rem,5vw,3.25rem)] font-black leading-[1.12]"
              style={{ color: "var(--xyvoo-store-section-title)" }}
            >
              {SOLUTIONS_STORE_HERO.title}
            </h1>
            <p
              className="mx-auto mb-12 max-w-[640px] text-[17px] leading-relaxed"
              style={{ color: "rgb(255 255 255 / 0.72)" }}
            >
              {SOLUTIONS_STORE_HERO.subtitle}
            </p>
            <div className="flex flex-wrap items-center justify-center gap-4">
              <Link
                href={XYVOO_AUTH_ROUTES.store.register}
                className="inline-flex items-center gap-2 rounded-2xl px-8 py-4 text-base font-bold text-white shadow-lg transition-opacity hover:opacity-92"
                style={{ background: "var(--xyvoo-blue)" }}
              >
                Get started
                <ArrowRight className="h-4 w-4 shrink-0" />
              </Link>
              <Link
                href="/contact"
                className="inline-flex items-center gap-2 rounded-2xl border-2 px-8 py-4 text-base font-semibold text-white transition-colors hover:bg-white/[0.06]"
                style={{ borderColor: "rgb(255 255 255 / 0.35)" }}
              >
                Contact
              </Link>
            </div>
          </motion.div>
        </div>
      </section>

      {SOLUTIONS_STORE_FEATURES.map((section, index) => (
        <section
          key={section.eyebrow}
          className="px-6 py-20"
          style={{
            background:
              index % 2 === 0 ? "var(--xyvoo-white)" : "var(--xyvoo-navy-subtle-bg)",
          }}
        >
          <motion.div
            initial="offscreen"
            whileInView="onscreen"
            viewport={{ once: true, margin: "-60px" }}
            variants={fadeUp}
            className="mx-auto max-w-[960px]"
          >
            <article
              className="rounded-[22px] border bg-white p-8 md:p-11"
              style={{
                borderColor: "rgb(var(--xyvoo-blue-rgb) / 0.14)",
                boxShadow: "0 8px 32px rgb(var(--xyvoo-navy-rgb) / 0.07)",
              }}
            >
              <SectionEyebrow
                eyebrow={section.eyebrow}
                title={section.title}
                className="[&>h2]:[color:var(--xyvoo-products-navy-alt)] [&>p]:[color:var(--xyvoo-blue)]"
              />
              <p
                className="mt-5 max-w-[720px] text-[16px] leading-[1.75]"
                style={{ color: "var(--xyvoo-navy-muted-text)" }}
              >
                {section.description}
              </p>
              <ul className="mt-9 flex flex-col gap-[14px]">
                {section.bullets.map((bullet) => (
                  <li
                    key={bullet}
                    className="flex gap-3 text-[15px] leading-relaxed"
                    style={{ color: "var(--xyvoo-navy-muted-text)" }}
                  >
                    <Check
                      className="mt-0.5 h-5 w-5 shrink-0 text-xyvoo-blue"
                      aria-hidden
                    />
                    {bullet}
                  </li>
                ))}
              </ul>
            </article>
          </motion.div>
        </section>
      ))}

      <section
        className="relative overflow-hidden px-6 py-24 text-center"
        style={{ background: "var(--xyvoo-store-features-row-2)" }}
      >
        <div
          className="pointer-events-none absolute bottom-0 right-0 h-[200px] w-[200px] rounded-full blur-[48px]"
          style={{ background: "rgb(var(--xyvoo-mint-rgb) / 0.12)" }}
          aria-hidden
        />
        <motion.div
          initial="offscreen"
          whileInView="onscreen"
          viewport={{ once: true }}
          variants={fadeUp}
          className="relative mx-auto max-w-2xl"
        >
          <h2
            className="mb-4 text-3xl font-black md:text-4xl"
            style={{ color: "var(--xyvoo-store-features-headline)" }}
          >
            Launch your branded store today
          </h2>
          <p
            className="mb-10 text-[17px]"
            style={{ color: "var(--xyvoo-store-features-subtext)" }}
          >
            Compare Store tiers or talk to us about inventory migration — most merchants go live in days.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-4">
            <Link
              href={XYVOO_AUTH_ROUTES.store.register}
              className="inline-flex items-center gap-2 rounded-2xl px-8 py-4 text-base font-black text-white shadow-lg transition-opacity hover:opacity-92"
              style={{ background: "var(--xyvoo-blue)" }}
            >
              Get started
              <ArrowRight className="h-4 w-4 shrink-0" />
            </Link>
            <Link
              href="/pricing"
              className="inline-flex items-center rounded-2xl border-2 px-8 py-4 text-base font-semibold text-white transition-colors hover:bg-white/[0.08]"
              style={{ borderColor: "rgb(255 255 255 / 0.35)" }}
            >
              Pricing
            </Link>
          </div>
        </motion.div>
      </section>
    </WebsiteLayout>
  );
}

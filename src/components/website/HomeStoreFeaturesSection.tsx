"use client";

import { useRef } from "react";
import Link from "next/link";
import { motion, useInView } from "framer-motion";
import {
  ArrowRight,
  Store,
  Package,
  Truck,
  CreditCard,
  type LucideIcon,
} from "lucide-react";
import { SectionEyebrow } from "@/components/website/SectionEyebrow";
import type { FadeInSectionProps } from "@/types";

type StoreFeatureRow = {
  id: string;
  number: string;
  visualIcon: LucideIcon;
  title: string;
  description: string;
  bullets: string[];
  urlLabel: string;
  badge: string;
  learnMoreHref: string;
};

const STORE_FEATURES: StoreFeatureRow[] = [
  {
    id: "storefront",
    number: "01 — Branded Storefront",
    visualIcon: Store,
    title: "Your brand front and center.",
    description:
      "Your logo, your domain, your identity. Shoppers never see XYVOO. Full PWA support included.",
    bullets: [
      "Custom domain and storefront identity",
      "Mobile-first PWA experience out of the box",
      "Theme controls for colors, banners, and pages",
    ],
    urlLabel: "app.xyvoo.com / storefront",
    badge: "Live Store",
    learnMoreHref: "/home/about",
  },
  {
    id: "catalog",
    number: "02 — Product Management",
    visualIcon: Package,
    title: "Catalogs managed without friction.",
    description:
      "Catalogues, variants, pricing, and real-time inventory control from a single dashboard.",
    bullets: [
      "Variants, categories, bundles, and promotions",
      "Stock updates and low-inventory alerts in real time",
      "Bulk upload and batch edits for fast merchandising",
    ],
    urlLabel: "app.xyvoo.com / products",
    badge: "Inventory Sync",
    learnMoreHref: "/home/about",
  },
  {
    id: "orders",
    number: "03 — Orders & Fulfilment",
    visualIcon: Truck,
    title: "From checkout to delivery, tracked.",
    description:
      "End-to-end order management from placement through fulfilment and delivery confirmation.",
    bullets: [
      "Unified order board with fulfillment statuses",
      "Delivery handoff and customer notification automation",
      "Returns and exceptions handled in one flow",
    ],
    urlLabel: "app.xyvoo.com / orders",
    badge: "Pipeline Active",
    learnMoreHref: "/home/about",
  },
  {
    id: "payments",
    number: "04 — Payments & Checkout",
    visualIcon: CreditCard,
    title: "Fast, trusted local checkout.",
    description:
      "Paystack, Flutterwave, and Stripe. Accept card, bank transfer, and USSD out of the box.",
    bullets: [
      "Paystack, Flutterwave, and Stripe integrations",
      "Supports card, transfer, and USSD payment flows",
      "Checkout events feed directly into sales analytics",
    ],
    urlLabel: "app.xyvoo.com / checkout",
    badge: "Secure Payments",
    learnMoreHref: "/home/about",
  },
];

function FadeIn({ children, delay = 0 }: FadeInSectionProps) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-50px" });
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 32 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.65, delay, ease: "easeOut" }}
    >
      {children}
    </motion.div>
  );
}

function StoreFeatureRowBlock({
  feature,
  reverse,
  rowIndex,
}: {
  feature: StoreFeatureRow;
  reverse: boolean;
  rowIndex: number;
}) {
  const VisualIcon = feature.visualIcon;
  const rowToken = (rowIndex % 4) + 1;
  return (
    <div
      className={`grid min-h-[520px] grid-cols-1 items-center overflow-hidden rounded-[20px] border md:grid-cols-2 ${
        reverse ? "md:[&>*:first-child]:order-2" : ""
      }`}
      style={{
        background: `var(--xyvoo-store-features-row-${rowToken})`,
        borderColor: "var(--xyvoo-store-features-row-border)",
        boxShadow:
          "var(--xyvoo-store-features-row-shadow-lg), var(--xyvoo-store-features-row-shadow-sm)",
      }}
    >
      <div className="flex flex-col px-5 pb-5 pt-9 sm:px-8 sm:pb-6 sm:pt-11 md:px-[72px] md:pb-[72px] md:pt-[72px]">
        <div
          className="mb-3 text-[11px] font-bold uppercase tracking-[0.16em]"
          style={{ color: "var(--xyvoo-store-features-number)" }}
        >
          {feature.number}
        </div>
        <h3
          className="mb-3 font-extrabold leading-[1.18] text-[clamp(1.55rem,3vw,1.9rem)]"
          style={{ color: "var(--xyvoo-store-features-title)" }}
        >
          {feature.title}
        </h3>
        <p
          className="mb-6 max-w-[400px] text-[15.5px] leading-[1.75]"
          style={{ color: "var(--xyvoo-store-features-desc)" }}
        >
          {feature.description}
        </p>
        <div className="mb-8 flex flex-col gap-[10px]">
          {feature.bullets.map((bullet) => (
            <div
              key={bullet}
              className="flex items-start gap-[11px] text-[13.5px] leading-[1.5]"
              style={{ color: "var(--xyvoo-store-features-bullet)" }}
            >
              <span
                className="mt-[5px] h-[6px] w-[6px] shrink-0 rounded-full"
                style={{ background: "var(--xyvoo-blue)" }}
              />
              <span>{bullet}</span>
            </div>
          ))}
        </div>
        <Link
          href={feature.learnMoreHref}
          className="inline-flex items-center gap-2 text-sm font-semibold"
          style={{ color: "var(--xyvoo-store-features-secondary-text)" }}
        >
          Learn more
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>

      <div className="relative flex items-center justify-center px-5 pb-9 pt-3 sm:px-8 sm:pb-11 md:px-[36px] md:py-12">
        <div
          className="pointer-events-none absolute left-1/2 top-1/2 z-0 h-[260px] w-[260px] -translate-x-1/2 -translate-y-1/2 rounded-full blur-[52px]"
          style={{ background: "var(--xyvoo-store-features-glow-a)" }}
        />
        <div
          className="pointer-events-none absolute bottom-4 right-4 z-0 h-[150px] w-[150px] rounded-full blur-[32px]"
          style={{ background: "var(--xyvoo-store-features-glow-b)" }}
        />
        <div
          className="relative z-[1] w-full overflow-hidden rounded-[14px] border"
          style={{
            background: "var(--xyvoo-store-features-visual-card-bg)",
            borderColor: "var(--xyvoo-store-features-visual-card-border)",
            boxShadow:
              "var(--xyvoo-store-features-visual-card-shadow-a), var(--xyvoo-store-features-visual-card-shadow-b)",
          }}
        >
          <div
            className="flex items-center gap-1.5 border-b px-3.5 py-2.5"
            style={{
              background: "var(--xyvoo-store-features-chrome-bg)",
              borderColor: "var(--xyvoo-store-features-chrome-border)",
            }}
          >
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ background: "var(--xyvoo-store-features-dot-red)" }}
            />
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ background: "var(--xyvoo-store-features-dot-yellow)" }}
            />
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ background: "var(--xyvoo-store-features-dot-green)" }}
            />
            <div
              className="mx-2 flex h-[22px] flex-1 items-center gap-1.5 rounded-[5px] border px-2.5"
              style={{ borderColor: "var(--xyvoo-store-features-chrome-url-border)" }}
            >
              <span
                className="h-[9px] w-[8px] rounded-[2px] border-[1.5px]"
                style={{ borderColor: "var(--xyvoo-store-features-lock)" }}
              />
              <span
                className="text-[10px]"
                style={{ color: "var(--xyvoo-store-features-chrome-url-text)" }}
              >
                {feature.urlLabel}
              </span>
            </div>
          </div>

          <div
            className="relative flex aspect-[16/10] w-full flex-col items-center justify-center gap-3 overflow-hidden"
            style={{
              background:
                feature.id === "storefront"
                  ? "var(--xyvoo-store-features-ph-1)"
                  : feature.id === "catalog"
                    ? "var(--xyvoo-store-features-ph-2)"
                    : feature.id === "orders"
                      ? "var(--xyvoo-store-features-ph-3)"
                      : "var(--xyvoo-store-features-ph-4)",
            }}
          >
            <div
              className="pointer-events-none absolute inset-0"
              style={{
                backgroundImage:
                  "radial-gradient(circle, var(--xyvoo-store-features-ph-dot) 1px, transparent 1px)",
                backgroundSize: "22px 22px",
              }}
            />
            <div
              className="relative z-[1] flex h-[52px] w-[52px] items-center justify-center rounded-[14px] border"
              style={{
                background: "var(--xyvoo-white)",
                borderColor: "var(--xyvoo-store-features-ph-icon-border)",
              }}
            >
              <VisualIcon className="h-[22px] w-[22px] text-xyvoo-blue" />
            </div>
            <span
              className="relative z-[1] text-center text-xs leading-[1.55]"
              style={{ color: "var(--xyvoo-store-features-ph-label)" }}
            >
              {feature.title} screenshot
              <br />
              goes here
            </span>
            <span
              className="absolute bottom-3.5 right-3.5 z-[2] rounded-full px-2.5 py-1 text-[10.5px] font-semibold uppercase tracking-[0.05em]"
              style={{
                background: "var(--xyvoo-store-features-badge-bg)",
                color: "var(--xyvoo-store-features-badge-text)",
              }}
            >
              {feature.badge}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export function HomeStoreFeaturesSection() {
  return (
    <section
      className="py-24"
      style={{ background: "var(--xyvoo-store-section-bg)" }}
    >
      <div className="mx-auto max-w-[1200px] px-6">
        <FadeIn>
          <div className="px-5 pb-11 pt-0 text-center md:px-8 md:pb-[72px] md:pt-0">
            <SectionEyebrow
              eyebrow={
                <>
                  <span
                    className="inline-block h-[5px] w-[5px] rounded-full"
                    style={{ background: "var(--xyvoo-teal-product)" }}
                  />
                  Store Platform
                </>
              }
              title={
                <>
                  A complete commerce platform.
                  <br />
                  <span
                    style={{
                      background: "var(--xyvoo-gradient-text)",
                      WebkitBackgroundClip: "text",
                      backgroundClip: "text",
                      WebkitTextFillColor: "transparent",
                    }}
                  >
                    Branded as yours.
                  </span>
                </>
              }
              eyebrowClassName="mb-[18px] inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-[11.5px] font-semibold uppercase tracking-[0.13em]"
              titleClassName="mb-4 text-[clamp(1.625rem,4.4vw,2.75rem)] font-extrabold leading-[1.12]"
              className="[&>h2]:[color:var(--xyvoo-store-features-headline)] [&>p]:[color:var(--xyvoo-store-features-eyebrow-text)] [&>p]:[border-color:var(--xyvoo-store-features-eyebrow-border)] [&>p]:[background:var(--xyvoo-store-features-eyebrow-bg)]"
            />
            <p
              className="mx-auto max-w-[480px] text-[17px] leading-[1.65]"
              style={{ color: "var(--xyvoo-store-features-subtext)" }}
            >
              Run storefront, catalog, orders, and payments from one operating
              system built for growth.
            </p>
          </div>
        </FadeIn>
      </div>

      <div className="mx-auto flex max-w-[1200px] flex-col gap-6 px-6 md:px-8 lg:gap-6">
        {STORE_FEATURES.map((feature, index) => (
          <div
            key={feature.id}
            className="relative lg:sticky lg:top-24"
            style={{ zIndex: index + 1 }}
          >
            <StoreFeatureRowBlock
              feature={feature}
              reverse={index % 2 === 1}
              rowIndex={index}
            />
          </div>
        ))}
      </div>
    </section>
  );
}

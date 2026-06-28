"use client";

import type { ReactNode } from "react";
import { useRef } from "react";
import Link from "next/link";
import { motion, useInView } from "framer-motion";
import { Infinity as InfinityIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SectionEyebrow } from "@/components/website/SectionEyebrow";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { XYVOO_AUTH_ROUTES } from "@/constants/auth-links";

const transition = { duration: 0.65, ease: "easeOut" as const };

function Reveal({
  children,
  className,
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-40px", amount: 0.12 });
  return (
    <motion.div
      ref={ref}
      className={className}
      initial={{ opacity: 0, y: 32 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ ...transition, delay }}
    >
      {children}
    </motion.div>
  );
}

const HMS_STATS = [
  { value: "10", label: "Core Modules" },
  { value: "99.9%", label: "Uptime SLA" },
  { value: "<60s", label: "Provisioning" },
  { value: "14-Day", label: "Free Trial" },
];

const STORE_STATS = [
  {
    value: (
      <InfinityIcon
        className="size-[1.125rem] shrink-0 stroke-[2.5]"
        aria-hidden
      />
    ),
    label: "Unlimited Products",
  },
  { value: "0%", label: "Platform Fee" },
  { value: "Built-in", label: "Analytics" },
  { value: "Free", label: "Plan Available" },
];

function StatCell({ value, label }: { value: ReactNode; label: string }) {
  return (
    <div className="rounded-xl border border-[rgb(13_27_42_/_0.07)] bg-[rgb(255_255_255_/_0.8)] px-4 py-4">
      <div
        className="mb-1 flex min-h-[1.125rem] items-center text-[18px] font-extrabold text-[var(--xyvoo-products-navy-alt)]"
        style={{ fontFamily: "var(--font-products-display), sans-serif" }}
      >
        {value}
      </div>
      <p className="text-[11px] font-medium tracking-wide text-[#9ca3af]">
        {label}
      </p>
    </div>
  );
}

export function HomeProductsSection() {
  return (
    <section
      className="relative overflow-hidden bg-white py-4 md:py-10 lg:py-25"
      style={{
        fontFamily:
          "var(--font-products-sans), var(--font-sans), system-ui, sans-serif",
      }}
      aria-labelledby="home-products-heading"
    >
      <div className="relative z-[1] mx-auto max-w-[1200px] px-6">
        <Reveal className="mb-12 text-center md:mb-16">
          <SectionEyebrow
            eyebrow="What We Build"
            title={
              <>
                Two industries. One platform.
                <br />
                Infinite possibilities.
              </>
            }
            titleId="home-products-heading"
            titleClassName="font-extrabold"
            className="[&>h2]:[font-family:var(--font-products-display),sans-serif]"
          />
        </Reveal>

        <div className="mx-auto grid max-w-[1200px] grid-cols-1 items-stretch gap-6 md:auto-rows-fr md:grid-cols-2 md:gap-6 md:px-2">
          <Reveal className="h-full">
            <Card
              className={cn(
                "group relative flex h-full min-h-0 flex-col gap-0 overflow-hidden rounded-3xl border border-[rgb(33_150_243_/_0.3)] bg-transparent py-0 text-[var(--xyvoo-products-navy-alt)] shadow-none ring-0 transition-all duration-300",
                "hover:-translate-y-1.5 hover:border-[rgb(33_150_243_/_0.55)] hover:shadow-[0_20px_64px_rgb(33_150_243_/_0.18)]",
              )}
              style={{
                background: "var(--xyvoo-product-card-hms-bg)",
                transition: "var(--xyvoo-products-transition)",
              }}
            >
              <div
                className="pointer-events-none absolute -right-[60px] -top-[60px] h-[200px] w-[200px] rounded-full"
                style={{ background: "var(--xyvoo-product-glow-hms)" }}
                aria-hidden
              />
              <CardHeader className="relative z-[1] shrink-0 space-y-4 px-8 pb-0 pt-10 md:px-12 md:pt-12">
                <p
                  className="text-[11px] font-bold uppercase tracking-[0.22em]"
                  style={{ color: "var(--xyvoo-blue-light)" }}
                >
                  For Hotels &amp; Properties
                </p>
                <CardTitle
                  className="text-[26px] font-extrabold leading-tight tracking-tight text-[var(--xyvoo-products-navy-alt)]"
                  style={{ fontFamily: "var(--font-products-display), sans-serif" }}
                >
                  Hotel Management, Your Brand
                </CardTitle>
                <CardDescription
                  className="text-[15px] leading-[1.7] text-[#4b5563]"
                  style={{ fontFamily: "var(--font-products-sans), sans-serif" }}
                >
                  White-label HMS — PMS, reservations, housekeeping, F&amp;B,
                  billing, OTA sync, and analytics. Staff never see XYVOO.
                </CardDescription>
              </CardHeader>
              <CardContent className="relative z-[1] px-8 pb-0 pt-6 md:px-12">
                <div className="grid grid-cols-2 gap-3">
                  {HMS_STATS.map((s) => (
                    <StatCell key={s.label} value={s.value} label={s.label} />
                  ))}
                </div>
              </CardContent>
              <CardFooter className="relative z-[1] mt-auto shrink-0 border-0 bg-transparent px-8 pb-10 pt-8 md:px-12 md:pb-12">
                <Button
                  variant="productHms"
                  size="product"
                  className="[transition:var(--xyvoo-products-transition)]"
                  asChild
                >
                  <Link href={XYVOO_AUTH_ROUTES.hms.register}>
                    Explore HMS
                    <InfinityIcon
                      className="size-4"
                      data-icon="inline-end"
                    />
                  </Link>
                </Button>
              </CardFooter>
            </Card>
          </Reveal>

          <Reveal className="h-full" delay={0.15}>
            <Card
              className={cn(
                "group relative flex h-full min-h-0 flex-col gap-0 overflow-hidden rounded-3xl border border-[rgb(77_208_196_/_0.3)] bg-transparent py-0 text-[var(--xyvoo-products-navy-alt)] shadow-none ring-0 transition-all duration-300",
                "hover:-translate-y-1.5 hover:border-[rgb(77_208_196_/_0.55)] hover:shadow-[0_20px_64px_rgb(77_208_196_/_0.18)]",
              )}
              style={{
                background: "var(--xyvoo-product-card-store-bg)",
                transition: "var(--xyvoo-products-transition)",
              }}
            >
              <div
                className="pointer-events-none absolute -right-[60px] -top-[60px] h-[200px] w-[200px] rounded-full"
                style={{ background: "var(--xyvoo-product-glow-store)" }}
                aria-hidden
              />
              <CardHeader className="relative z-[1] shrink-0 space-y-4 px-8 pb-0 pt-10 md:px-12 md:pt-12">
                <p
                  className="text-[11px] font-bold uppercase tracking-[0.22em]"
                  style={{ color: "var(--xyvoo-teal-product)" }}
                >
                  For Retailers &amp; Merchants
                </p>
                <CardTitle
                  className="text-[26px] font-extrabold leading-tight tracking-tight text-[var(--xyvoo-products-navy-alt)]"
                  style={{ fontFamily: "var(--font-products-display), sans-serif" }}
                >
                  E-Commerce, Your Brand
                </CardTitle>
                <CardDescription
                  className="text-[15px] leading-[1.7] text-[#4b5563]"
                  style={{ fontFamily: "var(--font-products-sans), sans-serif" }}
                >
                  A fully branded online storefront — products, orders, payments,
                  and customer tools — under your store&apos;s identity. Built to
                  sell.
                </CardDescription>
              </CardHeader>
              <CardContent className="relative z-[1] px-8 pb-0 pt-6 md:px-12">
                <div className="grid grid-cols-2 gap-3">
                  {STORE_STATS.map((s) => (
                    <StatCell key={s.label} value={s.value} label={s.label} />
                  ))}
                </div>
              </CardContent>
              <CardFooter className="relative z-[1] mt-auto shrink-0 border-0 bg-transparent px-8 pb-10 pt-8 md:px-12 md:pb-12">
                <Button
                  variant="productStore"
                  size="product"
                  className="[transition:var(--xyvoo-products-transition)]"
                  asChild
                >
                  <Link href={XYVOO_AUTH_ROUTES.store.register}>
                    Explore Store
                    <InfinityIcon
                      className="size-4"
                      data-icon="inline-end"
                    />
                  </Link>
                </Button>
              </CardFooter>
            </Card>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

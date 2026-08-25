"use client";

import { useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import { motion, useInView } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { SectionEyebrow } from "@/components/website/SectionEyebrow";

type TopCard = {
  id: string;
  icon: string;
  iconBg: string;
  title: string;
  description: string;
  linkLabel: string;
  linkHref: string;
};

type BottomCard = {
  id: string;
  title: string;
  description: string;
};

const TOP_CARDS: TopCard[] = [
  {
    id: "payments",
    icon: "/images/icons/payment.png",
    iconBg: "var(--xyvoo-blue)",
    title: "Payments that just work",
    description:
      "Accept payments the way your customers already pay — multiple currencies, local payment methods, no plugins or workarounds bolted on.",
    linkLabel: "See pricing",
    linkHref: "/pricing",
  },
  {
    id: "data-protection",
    icon: "/images/icons/gdprCompliant.png",
    iconBg: "var(--xyvoo-navy)",
    title: "Data protection, done properly",
    description:
      "Built to meet GDPR and adhere to local data protection policies — including Nigeria's NDPA — so guest and customer information stays secure wherever you operate.",
    linkLabel: "How we handle data",
    linkHref: "/privacy",
  },
  {
    id: "your-brand",
    icon: "/images/icons/brand.png",
    iconBg: "rgb(39 201 63)",
    title: "Your brand, always",
    description:
      "White-label by design. Your guests and customers see your brand — XYVOO stays invisible in the background.",
    linkLabel: "How white-labelling works",
    linkHref: "/about",
  },
];

const BOTTOM_CARDS: BottomCard[] = [
  {
    id: "fast-setup",
    title: "Set up in minutes, not months",
    description:
      "Most systems take weeks of configuration before you see anything. Yours can be live within the hour — try it free for 14 days before you commit to anything.",
  },
  {
    id: "real-support",
    title: "Real support, not tickets",
    description:
      "A 99.9% uptime SLA backed by priority support on every paid plan. Real people, real answers.",
  },
];

function FadeIn({
  children,
  delay = 0,
}: {
  children: React.ReactNode;
  delay?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-50px" });
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 24 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.6, delay, ease: "easeOut" }}
    >
      {children}
    </motion.div>
  );
}

export function HomeWhyXyvooSection() {
  return (
    <section className="bg-slate-50 py-16 lg:py-24" aria-labelledby="why-xyvoo-heading">
      <div className="mx-auto max-w-[1200px] px-6">
        <FadeIn>
          <div className="mx-auto mb-12 max-w-2xl text-center md:mb-16">
            <SectionEyebrow
              eyebrow="Why Businesses Choose Us"
              title={
                <>
                  We&apos;re not a features list — we&apos;re the team that
                  gets you live.
                </>
              }
              titleId="why-xyvoo-heading"
              titleClassName="text-[clamp(1.625rem,4.4vw,2.75rem)] font-extrabold leading-[1.15]"
              className="text-center [&>p]:justify-center"
              eyebrowClassName="flex items-center justify-center"
            />
            <p className="mx-auto mt-5 max-w-xl text-[16px] leading-[1.75] text-xyvoo-navy/65">
              Every plan comes with a platform built for how African
              businesses actually operate.
            </p>
          </div>
        </FadeIn>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          {TOP_CARDS.map((card, index) => {
            return (
              <FadeIn key={card.id} delay={index * 0.08}>
                <div className="flex h-full flex-col overflow-hidden rounded-none rounded-tr-[48px] border border-slate-100 bg-white shadow-[0_16px_36px_rgba(0,13,31,0.06)]">
                  <div
                    className="relative overflow-hidden flex items-center gap-3 px-6 py-6"
                    style={{ background: card.iconBg }}
                  >
                    {/* Subtle organic waves */}
                    <div className="absolute inset-0 pointer-events-none z-0 opacity-15">
                      <svg
                        className="absolute inset-0 w-full h-full"
                        viewBox="0 0 300 100"
                        preserveAspectRatio="none"
                        fill="none"
                        xmlns="http://www.w3.org/2000/svg"
                      >
                        <path
                          d="M-20,60 C60,20 120,80 200,50 C260,25 320,65 350,50 L350,120 L-20,120 Z"
                          fill="white"
                          opacity="0.3"
                        />
                        <path
                          d="M-20,75 C80,45 140,95 220,65 C280,40 310,75 350,65 L350,120 L-20,120 Z"
                          fill="white"
                          opacity="0.5"
                        />
                      </svg>
                    </div>

                    <Image
                      src={card.icon}
                      alt=""
                      width={60}
                      height={60}
                      className="relative z-10 shrink-0 object-contain"
                    />
                    <h3 className="relative z-10 text-[17px] font-extrabold leading-[1.25] text-white">
                      {card.title}
                    </h3>
                  </div>
                  <div className="flex flex-1 flex-col px-6 py-6">
                    <p className="mb-4 flex-1 text-[14.5px] leading-[1.7] text-xyvoo-navy/65">
                      {card.description}
                    </p>
                    <Link
                      href={card.linkHref}
                      className="inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-xyvoo-blue"
                    >
                      {card.linkLabel}
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  </div>
                </div>
              </FadeIn>
            );
          })}
        </div>

        <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2">
          {BOTTOM_CARDS.map((card, index) => (
            <FadeIn key={card.id} delay={0.24 + index * 0.08}>
              <div className="h-full rounded-none rounded-tr-[48px] border border-slate-100 bg-white p-8 shadow-[0_16px_36px_rgba(0,13,31,0.06)]">
                <h3 className="mb-3 text-[19px] font-extrabold leading-[1.2] text-xyvoo-navy">
                  {card.title}
                </h3>
                <p className="text-[14.5px] leading-[1.7] text-xyvoo-navy/65">
                  {card.description}
                </p>
              </div>
            </FadeIn>
          ))}
        </div>
      </div>
    </section>
  );
}

"use client";

import { useRef } from "react";
import { motion, useInView } from "framer-motion";
import { KeyRound, Palette, ShieldCheck, type LucideIcon } from "lucide-react";

type TopCard = {
  id: string;
  icon: LucideIcon;
  iconBg: string;
  title: string;
  description: string;
};

type BottomCard = {
  id: string;
  title: string;
  description: string;
};

const TOP_CARDS: TopCard[] = [
  {
    id: "one-login",
    icon: KeyRound,
    iconBg: "var(--xyvoo-blue)",
    title: "One login, every department",
    description:
      "Front desk, housekeeping, F&B and finance all work from the same platform — no juggling separate tools or passwords.",
  },
  {
    id: "your-brand",
    icon: Palette,
    iconBg: "var(--xyvoo-navy)",
    title: "Your brand, not ours",
    description:
      "Guests see your hotel's name, logo and colours everywhere — the booking page, the app, the receipts.",
  },
  {
    id: "secure-by-design",
    icon: ShieldCheck,
    iconBg: "var(--xyvoo-teal-product)",
    title: "Secure by design",
    description:
      "Every action is logged, and staff only see what their role needs to.",
  },
];

const BOTTOM_CARDS: BottomCard[] = [
  {
    id: "offline",
    title: "Keeps working, even offline",
    description:
      "Front desk and housekeeping keep running through a Wi-Fi drop, and sync the moment you're back online.",
  },
  {
    id: "grows-with-you",
    title: "Built to grow with you",
    description:
      "Add a second property, a new role or a new outlet without needing a new system.",
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

export function SolutionsHotelWhyOneSystem() {
  return (
    <section
      className="border-b border-slate-100 bg-slate-50 px-6 py-16 md:py-24"
      aria-labelledby="hotel-why-one-system-heading"
    >
      <div className="mx-auto max-w-[1200px]">
        <FadeIn>
          <div className="mx-auto mb-12 max-w-2xl text-center md:mb-16">
            <h2
              id="hotel-why-one-system-heading"
              className="text-balance text-[clamp(1.625rem,4.4vw,2.75rem)] font-extrabold leading-[1.15] tracking-tight text-xyvoo-navy"
            >
              Built as one system, not stitched together.
            </h2>
          </div>
        </FadeIn>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          {TOP_CARDS.map((card, index) => {
            const Icon = card.icon;
            return (
              <FadeIn key={card.id} delay={index * 0.08}>
                <div className="flex h-full flex-col overflow-hidden rounded-none rounded-tr-[48px] border border-slate-100 bg-white shadow-[0_16px_36px_rgba(0,13,31,0.06)]">
                  <div
                    className="relative overflow-hidden flex items-center gap-3 px-6 py-6"
                    style={{ background: card.iconBg }}
                  >
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

                    <div className="relative z-10 flex h-[60px] w-[60px] shrink-0 items-center justify-center">
                      <Icon className="h-8 w-8 text-white" aria-hidden />
                    </div>
                    <h3 className="relative z-10 text-[17px] font-extrabold leading-[1.25] text-white">
                      {card.title}
                    </h3>
                  </div>
                  <div className="flex flex-1 flex-col px-6 py-6">
                    <p className="flex-1 text-[14.5px] leading-[1.7] text-xyvoo-navy/65">
                      {card.description}
                    </p>
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

"use client";

import { useRef } from "react";
import Link from "next/link";
import { motion, useInView } from "framer-motion";
import {
  ArrowRight,
  LayoutDashboard,
  CalendarDays,
  BarChart2,
  ClipboardCheck,
  type LucideIcon,
} from "lucide-react";
import { SectionEyebrow } from "@/components/website/SectionEyebrow";
import type { FadeInSectionProps } from "@/types";

type FeatureRow = {
  id: string;
  number: string;
  title: string;
  description: string;
  bullets: string[];
  urlLabel: string;
  badge: string;
  learnMoreHref: string;
  visualIcon: LucideIcon;
};

const FEATURES: FeatureRow[] = [
  {
    id: "front-desk",
    number: "01 — Front Desk",
    title: "Your entire lobby,\non one screen.",
    description:
      "Check-ins, check-outs, and walk-ins handled in seconds. Live room status across every floor, without the back-and-forth.",
    bullets: [
      "Real-time room board across all floors",
      "One-click check-in with digital ID capture",
      "Handle walk-ins without disrupting active bookings",
    ],
    urlLabel: "app.xyvoo.com / front-desk",
    badge: "Live",
    learnMoreHref: "/home/about",
    visualIcon: LayoutDashboard,
  },
  {
    id: "reservations",
    number: "02 — Reservations",
    title: "Every booking,\nunder control.",
    description:
      "From direct inquiry to OTA sync — manage your full booking pipeline without jumping between tabs or tools.",
    bullets: [
      "Syncs with Booking.com, Expedia & all major OTAs",
      "Drag-to-reschedule on a visual timeline",
      "Automated confirmations and pre-arrival reminders",
    ],
    urlLabel: "app.xyvoo.com / reservations",
    badge: "OTA Synced",
    learnMoreHref: "/home/about",
    visualIcon: CalendarDays,
  },
  {
    id: "analytics",
    number: "03 — Revenue & Analytics",
    title: "The numbers GMs\nwake up thinking about.",
    description:
      "Occupancy, ADR, RevPAR — all surfaced in real time. Know exactly where your revenue is coming from and where it is leaking.",
    bullets: [
      "Live occupancy and ADR dashboard",
      "Revenue breakdown by room type and channel",
      "Trend comparisons across day, week, month, and year",
    ],
    urlLabel: "app.xyvoo.com / analytics",
    badge: "Live Data",
    learnMoreHref: "/home/about",
    visualIcon: BarChart2,
  },
  {
    id: "housekeeping",
    number: "04 — Housekeeping",
    title: "Operations that\nrun without chaos.",
    description:
      "Live room board, task assignment, maintenance tickets. Every room's status visible to the right team — without a single phone call.",
    bullets: [
      "Dirty / clean / inspected status updated in real time",
      "Task assignment by floor, room type, or staff member",
      "Maintenance tickets with photo attachment support",
    ],
    urlLabel: "app.xyvoo.com / housekeeping",
    badge: "Real-time",
    learnMoreHref: "/home/about",
    visualIcon: ClipboardCheck,
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

function FeatureRowBlock({
  feature,
  reverse,
  rowIndex,
}: {
  feature: FeatureRow;
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
        background: `var(--xyvoo-hms-features-row-${rowToken})`,
        borderColor: "var(--xyvoo-hms-features-row-border)",
        boxShadow:
          "var(--xyvoo-hms-features-row-shadow-lg), var(--xyvoo-hms-features-row-shadow-sm)",
      }}
    >
      <div className="flex flex-col px-5 pb-5 pt-9 sm:px-8 sm:pb-6 sm:pt-11 md:px-[72px] md:pb-[72px] md:pt-[72px]">
        <div
          className="mb-3 text-[11px] font-bold uppercase tracking-[0.16em]"
          style={{ color: "var(--xyvoo-hms-features-number)" }}
        >
          {feature.number}
        </div>
        <h3
          className="mb-3 whitespace-pre-line font-extrabold leading-[1.18] text-[clamp(1.55rem,3vw,1.9rem)]"
          style={{ color: "var(--xyvoo-hms-features-title)" }}
        >
          {feature.title}
        </h3>
        <p
          className="mb-6 max-w-[400px] text-[15.5px] leading-[1.75]"
          style={{ color: "var(--xyvoo-hms-features-desc)" }}
        >
          {feature.description}
        </p>
        <div className="mb-8 flex flex-col gap-[10px]">
          {feature.bullets.map((bullet) => (
            <div
              key={bullet}
              className="flex items-start gap-[11px] text-[13.5px] leading-[1.5]"
              style={{ color: "var(--xyvoo-hms-features-bullet)" }}
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
          style={{ color: "var(--xyvoo-hms-features-secondary-text)" }}
        >
          Learn more
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>

      <div className="relative flex items-center justify-center px-5 pb-9 pt-3 sm:px-8 sm:pb-11 md:px-[36px] md:py-12">
        <div
          className="pointer-events-none absolute left-1/2 top-1/2 z-0 h-[260px] w-[260px] -translate-x-1/2 -translate-y-1/2 rounded-full blur-[52px]"
          style={{ background: "var(--xyvoo-hms-features-glow-a)" }}
        />
        <div
          className="pointer-events-none absolute bottom-4 right-4 z-0 h-[150px] w-[150px] rounded-full blur-[32px]"
          style={{ background: "var(--xyvoo-hms-features-glow-b)" }}
        />
        <div
          className="relative z-[1] w-full overflow-hidden rounded-[14px] border"
          style={{
            background: "var(--xyvoo-hms-features-visual-card-bg)",
            borderColor: "var(--xyvoo-hms-features-visual-card-border)",
            boxShadow:
              "var(--xyvoo-hms-features-visual-card-shadow-a), var(--xyvoo-hms-features-visual-card-shadow-b)",
          }}
        >
          <div
            className="flex items-center gap-1.5 border-b px-3.5 py-2.5"
            style={{
              background: "var(--xyvoo-hms-features-chrome-bg)",
              borderColor: "var(--xyvoo-hms-features-chrome-border)",
            }}
          >
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: "var(--xyvoo-hms-features-dot-red)" }} />
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: "var(--xyvoo-hms-features-dot-yellow)" }} />
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: "var(--xyvoo-hms-features-dot-green)" }} />
            <div
              className="mx-2 flex h-[22px] flex-1 items-center gap-1.5 rounded-[5px] border px-2.5"
              style={{ borderColor: "var(--xyvoo-hms-features-chrome-url-border)" }}
            >
              <span
                className="h-[9px] w-[8px] rounded-[2px] border-[1.5px]"
                style={{ borderColor: "var(--xyvoo-hms-features-lock)" }}
              />
              <span className="text-[10px]" style={{ color: "var(--xyvoo-hms-features-chrome-url-text)" }}>
                {feature.urlLabel}
              </span>
            </div>
          </div>

          <div
            className="relative flex aspect-[16/10] w-full flex-col items-center justify-center gap-3 overflow-hidden"
            style={{
              background:
                feature.id === "front-desk"
                  ? "var(--xyvoo-hms-features-ph-1)"
                  : feature.id === "reservations"
                    ? "var(--xyvoo-hms-features-ph-2)"
                    : feature.id === "analytics"
                      ? "var(--xyvoo-hms-features-ph-3)"
                      : "var(--xyvoo-hms-features-ph-4)",
            }}
          >
            <div
              className="pointer-events-none absolute inset-0"
              style={{
                backgroundImage:
                  "radial-gradient(circle, var(--xyvoo-hms-features-ph-dot) 1px, transparent 1px)",
                backgroundSize: "22px 22px",
              }}
            />
            <div
              className="relative z-[1] flex h-[52px] w-[52px] items-center justify-center rounded-[14px] border"
              style={{
                background: "var(--xyvoo-white)",
                borderColor: "var(--xyvoo-hms-features-ph-icon-border)",
              }}
            >
              <VisualIcon className="h-[22px] w-[22px] text-xyvoo-blue" />
            </div>
            <span
              className="relative z-[1] text-center text-xs leading-[1.55]"
              style={{ color: "var(--xyvoo-hms-features-ph-label)" }}
            >
              {feature.title.replace("\n", " ")} screenshot
              <br />
              goes here
            </span>
            <span
              className="absolute bottom-3.5 right-3.5 z-[2] rounded-full px-2.5 py-1 text-[10.5px] font-semibold uppercase tracking-[0.05em]"
              style={{
                background: "var(--xyvoo-hms-features-badge-bg)",
                color: "var(--xyvoo-hms-features-badge-text)",
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

export function HomeWhyChooseSection() {
  return (
    <section
      className="px-3 pb-10 md:px-6 md:pb-16"
      style={{ background: "var(--xyvoo-hms-features-bg)" }}
      aria-label="XYVOO HMS Platform Features"
    >
      <div className="mx-auto max-w-[1200px]">
        <FadeIn>
          <div className="px-5 pb-11 pt-0 text-center md:px-8 md:pb-[72px] md:pt-0">
            <SectionEyebrow
              eyebrow={
                <>
                  <span
                    className="inline-block h-[5px] w-[5px] rounded-full"
                    style={{ background: "var(--xyvoo-blue)" }}
                  />
                  Platform Features
                </>
              }
              title={
                <>
                  Built for how hotels
                  <br />
                  <span
                    style={{
                      background: "var(--xyvoo-gradient-text)",
                      WebkitBackgroundClip: "text",
                      backgroundClip: "text",
                      WebkitTextFillColor: "transparent",
                    }}
                  >
                    actually operate.
                  </span>
                </>
              }
              eyebrowClassName="mb-[18px] inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-[11.5px] font-semibold uppercase tracking-[0.13em]"
              titleClassName="mb-4 text-[clamp(1.625rem,4.4vw,2.75rem)] font-extrabold leading-[1.12]"
              className="[&>h2]:[color:var(--xyvoo-hms-features-headline)] [&>p]:[color:var(--xyvoo-hms-features-eyebrow-text)] [&>p]:[border-color:var(--xyvoo-hms-features-eyebrow-border)] [&>p]:[background:var(--xyvoo-hms-features-eyebrow-bg)]"
            />
            <p
              className="mx-auto max-w-[480px] text-[17px] leading-[1.65]"
              style={{ color: "var(--xyvoo-hms-features-subtext)" }}
            >
              Every department. Every shift. One platform that keeps up with your
              team.
            </p>
          </div>
        </FadeIn>

        <div className="flex flex-col gap-6 md:pb-[20vh]">
          {FEATURES.map((feature, index) => (
            <div
              key={feature.id}
              className="relative md:sticky md:top-24"
              style={{ zIndex: index + 1 }}
            >
              <FeatureRowBlock
                feature={feature}
                reverse={index % 2 === 1}
                rowIndex={index}
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

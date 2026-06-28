"use client";

import { cn } from "@/lib/utils";

const FEATURE_LABELS = [
  "Multi-Currency Support",
  "Unlimited Staff Accounts",
  "Instant Payment Confirmation",
  "White-Label Branding",
  "Offline-First Operation",
  "Installable PWA",
  "Built-In Analytics Dashboard",
  "Multi-Property Management",
  "OTA & Channel Sync",
  "Automated Tax & Invoicing",
  "Real-Time Inventory Tracking",
  "Email Marketing Tools",
  "Custom Subdomain",
  "14-Day Free Trial",
  "7-Year Immutable Audit Log",
  "Integrated POS System",
  "Role-Based Access Control",
  "Paystack & Flutterwave Support",
  "SEO & Page Builder Tools",
  "99.9% Uptime SLA",
  "Subdomain to Custom Domain",
  "Digital Key Integration",
  "Automated Night Audit",
  "Split Billing",
  "Guest Folio Management",
  "Discount & Promo Engine",
  "Webhook & API Access",
  "Scheduled Report Delivery",
  "Real-Time Room Status Board",
  "GDPR & NDPA Compliant",
] as const;

const CHIP =
  "rounded-xl bg-slate-500/[0.08] text-slate-600 dark:bg-slate-400/[0.08] dark:text-slate-400";

function MarqueeTrack({ labels }: { labels: readonly string[] }) {
  const doubled = [...labels, ...labels] as string[];

  return (
    <div
      className={cn(
        "flex w-max gap-4 pr-4",
        "xyvoo-feature-marquee--rtl",
      )}
    >
      {doubled.map((label, i) => (
        <span
          key={`${label}-${i}`}
          className={cn(
            "shrink-0 whitespace-nowrap px-4 py-2.5 text-sm font-medium",
            CHIP,
          )}
        >
          {label}
        </span>
      ))}
    </div>
  );
}

export function HomeFeatureMarquee() {
  return (
    <section
      className="w-full bg-background"
      aria-labelledby="xyvoo-feature-marquee-title"
    >
      <h2 id="xyvoo-feature-marquee-title" className="sr-only">
        XYVOO platform features
      </h2>
      <div
        className="mx-auto w-full max-w-full px-4 py-1 lg:w-[70%] lg:px-0"
        aria-hidden="true"
      >
        <div className="relative overflow-hidden rounded-xl bg-muted/10 py-3">
          <MarqueeTrack labels={FEATURE_LABELS} />
          <div
            className="pointer-events-none absolute inset-y-0 left-0 z-10 w-14 bg-gradient-to-r from-background via-background/75 to-transparent backdrop-blur-[6px] sm:w-20 lg:w-24"
            aria-hidden
          />
          <div
            className="pointer-events-none absolute inset-y-0 right-0 z-10 w-14 bg-gradient-to-l from-background via-background/75 to-transparent backdrop-blur-[6px] sm:w-20 lg:w-24"
            aria-hidden
          />
        </div>
      </div>
    </section>
  );
}

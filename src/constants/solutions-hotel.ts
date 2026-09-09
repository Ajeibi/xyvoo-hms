import type { SolutionsOnboardingCard } from "@/components/website/SolutionsOnboardingStack";

export const SOLUTIONS_HOTEL_HERO = {
  eyebrow: "Hotel Management System",
  title: "One connected operating system for your entire property.",
  subtitle:
    "Front desk to housekeeping, F&B to finance — every department runs under your brand, connected in real time.",
};

/** Sticky-stack modules */
export type SolutionsHotelStackModule = {
  id: string;
  number: string;
  title: string;
  description: string;
  bullets: string[];
  urlLabel: string;
};

export const SOLUTIONS_HOTEL_STACK_MODULES: SolutionsHotelStackModule[] = [
  {
    id: "pms",
    number: "01 — Property Management (PMS)",
    title: "Every room,\ntracked end to end.",
    description:
      "Full inventory and lifecycle control — types, floors, and housekeeping tied to what guests see at the desk.",
    bullets: [
      "See every room's status — clean, dirty, occupied or out of order — the moment it changes",
      "Housekeeping assignments and room setup, all in one board",
    ],
    urlLabel: "app.xyvoo.com / rooms",
  },
  {
    id: "crs",
    number: "02 — Central Reservations (CRS)",
    title: "One inventory,\nevery channel.",
    description:
      "Create, change, or cancel stays with confidence — channels stay aligned after every update.",
    bullets: [
      "Create, change or cancel a booking and every channel updates in seconds",
      "Rates and inventory stay in sync across Booking.com, Expedia and more",
    ],
    urlLabel: "app.xyvoo.com / reservations",
  },
  {
    id: "front-office",
    number: "03 — Front office",
    title: "Check-in that\nfeels effortless.",
    description:
      "One-screen arrivals and departures — profiles, room assignment, and walk-ins without chaos.",
    bullets: [
      "Check guests in and assign a room in one screen, walk-ins included",
      "Guest profiles and check-out handled without the paper trail",
    ],
    urlLabel: "app.xyvoo.com / front-desk",
  },
  {
    id: "housekeeping",
    number: "04 — Housekeeping",
    title: "Turns that\ndon’t stall.",
    description:
      "Shift-based run sheets, live boards, and faults that engineering sees immediately.",
    bullets: [
      "Shift run sheets and task assignments your team can actually follow",
      "Faults get flagged to maintenance the moment housekeeping spots them",
    ],
    urlLabel: "app.xyvoo.com / housekeeping",
  },
  {
    id: "hr",
    number: "05 — HR & scheduling",
    title: "Your team,\nrostered fairly.",
    description:
      "Records, shifts, time capture, and exports finance can use.",
    bullets: [
      "Rosters, clock-ins and leave requests, all in one place for every shift",
      "Payroll-ready exports, no manual re-entry",
    ],
    urlLabel: "app.xyvoo.com / hr",
  },
  {
    id: "fb-pos",
    number: "06 — F&B / POS",
    title: "Outlet revenue,\nposted cleanly.",
    description:
      "Point-of-sale built for hotel F&B — from table to kitchen to folio without re-keying.",
    bullets: [
      "Orders go straight from table to kitchen screen — no re-keying",
      "Voids and refunds need manager sign-off, so nothing slips through",
    ],
    urlLabel: "app.xyvoo.com / pos",
  },
  {
    id: "billing",
    number: "07 — Billing & invoicing",
    title: "Folios your\nfinance team trusts.",
    description:
      "Branded documents, configurable taxes, and controls where money moves.",
    bullets: [
      "Every charge lands on the folio — nothing gets missed or double-billed",
      "Receipts and invoices carry your hotel's brand, with local taxes handled automatically",
    ],
    urlLabel: "app.xyvoo.com / billing",
  },
  {
    id: "cmms",
    number: "08 — CMMS / Maintenance",
    title: "Assets and work orders,\nin one loop.",
    description:
      "Track equipment, preventive schedules, and resolution — from fault to fixed.",
    bullets: [
      "A fault reported anywhere becomes a work order, tracked through to resolution",
      "Preventive maintenance scheduled against a full asset register",
    ],
    urlLabel: "app.xyvoo.com / maintenance",
  },
  {
    id: "procurement",
    number: "09 — Procurement & inventory",
    title: "Stock and spend,\nunder control.",
    description:
      "Vendors, approvals, receiving, and levels — including F&B operational inventory.",
    bullets: [
      "Purchase orders route for approval automatically once they pass your threshold",
      "Stock levels — including F&B — stay visible from order to delivery",
    ],
    urlLabel: "app.xyvoo.com / procurement",
  },
  {
    id: "analytics",
    number: "10 — Analytics & reporting",
    title: "Operational truth,\nwithout the noise.",
    description:
      "Tenant-scoped dashboards and revenue views — OLAP-backed reporting separated from live operations.",
    bullets: [
      "Live dashboards for every department, plus revenue reporting for ownership",
      "Data infrastructure built to scale as your property grows",
    ],
    urlLabel: "app.xyvoo.com / analytics",
  },
];

export const SOLUTIONS_HOTEL_INTEGRATIONS_TITLE = "Integrations";
export const SOLUTIONS_HOTEL_INTEGRATIONS_INTRO =
  "Turn on the channels you need, whenever you're ready — nothing forced on you upfront.";

export type SolutionsHotelIntegrationItem = {
  title: string;
  description: string;
};

export const SOLUTIONS_HOTEL_INTEGRATIONS_ITEMS: SolutionsHotelIntegrationItem[] = [
  {
    title: "OTA channels, built in",
    description:
      "Booking.com, Expedia and more stay in sync automatically — rates and availability update everywhere the moment they change here.",
  },
  {
    title: "Your payment providers",
    description:
      "Connect the payment providers you already use — no need to change how guests pay just to switch systems.",
  },
  {
    title: "Accounting systems",
    description:
      "Sync folios and billing data with your existing accounting software, so finance isn't re-entering what's already been charged.",
  },
  {
    title: "Smart locks",
    description:
      "Enable keyless check-in by connecting supported smart lock systems — guests get access the moment they're checked in.",
  },
  {
    title: "WhatsApp notifications",
    description:
      "Send booking confirmations, check-in details and staff alerts over WhatsApp, without a separate messaging tool.",
  },
];

export const SOLUTIONS_HOTEL_ONBOARDING_HEADING = "From sign-up to check-in, in one afternoon.";

export const SOLUTIONS_HOTEL_ONBOARDING_CARDS: SolutionsOnboardingCard[] = [
  {
    id: "sign-up",
    title: "Sign up & go live",
    description:
      "Hotel details, quick verification, and your plan — your property is live within a minute of signing up.",
    explanation:
      "There's no separate hosting to arrange and no developer to wait on. The moment your details are verified, you're straight into your dashboard with your property already live — ready to start building out rooms, rates and staff access.",
  },
  {
    id: "setup-checklist",
    title: "Follow the setup checklist",
    description:
      "A simple setup checklist guides you through the rest, at your own pace.",
    explanation:
      "Rooms, rates, staff accounts and the modules you actually need — laid out as a checklist so nothing gets missed, but nothing forces your hand either. Work through it in one sitting or a few minutes a day; your property stays live throughout.",
  },
  {
    id: "install",
    title: "Install it anywhere",
    description:
      "Works like an app on any phone, tablet or desktop — no app store needed.",
    explanation:
      "Front desk, housekeeping, management — everyone installs it straight from the browser onto whatever device they're already using, no app store approval or IT rollout required. The same dashboard, wherever a shift happens to be.",
  },
  {
    id: "start-free",
    title: "Start free, scale later",
    description:
      "14-day free trial, no card required — add more properties any time.",
    explanation:
      "Try the full system for 14 days without entering payment details. When you're ready to commit, upgrading is one step in your dashboard — and adding a second or third property never means starting over on a separate system.",
  },
];

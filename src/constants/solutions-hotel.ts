export const SOLUTIONS_HOTEL_HERO = {
  eyebrow: "Hotel Management System",
  title: "One connected operating system for your entire property.",
  subtitle:
    "Front desk to housekeeping, F&B to finance — every department runs under your brand, with full visibility from one dashboard.",
};

/** Intro band — two-column grid on large screens */
export const SOLUTIONS_HOTEL_PLATFORM_TITLE = "Platform & architecture";
export const SOLUTIONS_HOTEL_PLATFORM_SUBTITLE =
  "Multi-tenant HMS built for isolation, brand, and serious operations — without bolt-ons.";
export const SOLUTIONS_HOTEL_PLATFORM_ITEMS: string[] = [
  "Multi-tenant, white-label SaaS — isolated, branded environment per hotel",
  "Subdomain-per-tenant routing (e.g. grandhotel.xyvoo.com)",
  "Dynamic PWA manifest per tenant — name, logo, and brand colour on install",
  "Offline-first PWA with IndexedDB queuing and automatic sync",
  "Event sourcing — immutable audit trail, scoped per tenant",
  "CQRS — separated read/write paths for high-throughput modules",
  "Role-based access control — 10 roles within tenant boundaries",
  "JWT auth with tenant_id, role, and user_id claims",
  "Multi-region deployment with configurable data residency",
];

/** Sticky-stack modules (V1 pillars) */
export type SolutionsHotelStackModule = {
  id: string;
  number: string;
  title: string;
  description: string;
  bullets: string[];
  badge: string;
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
      "Room inventory with full lifecycle visibility",
      "Room types and floor-plan setup",
      "Live status board: Clean / Dirty / Occupied / Out of order",
      "Housekeeping assignment per room",
      "Target: status visible at front desk within seconds of update",
    ],
    badge: "P0",
    urlLabel: "app.xyvoo.com / rooms",
  },
  {
    id: "crs",
    number: "02 — Central Reservations (CRS)",
    title: "One inventory,\nevery channel.",
    description:
      "Create, change, or cancel stays with confidence — channels stay aligned after every update.",
    bullets: [
      "Reservation create, modify, and cancel",
      "OTA inventory sync (Booking.com, Expedia, and more)",
      "Fast propagation after reservation changes",
      "Rate and channel management",
    ],
    badge: "P0",
    urlLabel: "app.xyvoo.com / reservations",
  },
  {
    id: "front-office",
    number: "03 — Front office",
    title: "Check-in that\nfeels effortless.",
    description:
      "One-screen arrivals and departures — profiles, room assignment, and walk-ins without chaos.",
    bullets: [
      "Single-flow check-in: guest profile + room assignment",
      "Structured check-out",
      "Guest profile management",
      "Walk-in bookings supported",
      "Operational target: smooth lobby throughput",
    ],
    badge: "P0",
    urlLabel: "app.xyvoo.com / front-desk",
  },
  {
    id: "housekeeping",
    number: "04 — Housekeeping",
    title: "Turns that\ndon’t stall.",
    description:
      "Shift-based run sheets, live boards, and faults that engineering sees immediately.",
    bullets: [
      "Run sheets per shift",
      "Room status integrated with PMS board",
      "Maintenance requests from housekeeping",
      "Assignment and task tracking",
    ],
    badge: "P0",
    urlLabel: "app.xyvoo.com / housekeeping",
  },
  {
    id: "fb-pos",
    number: "05 — F&B / POS",
    title: "Outlet revenue,\nposted cleanly.",
    description:
      "Point-of-sale built for hotel F&B — from table to kitchen to folio without re-keying.",
    bullets: [
      "Full POS for hotel F&B outlets",
      "Orders routed to Kitchen Display (KDS)",
      "Menu management",
      "Void and refund flows with manager PIN",
      "Table and order management",
    ],
    badge: "P0",
    urlLabel: "app.xyvoo.com / pos",
  },
  {
    id: "billing",
    number: "06 — Billing & invoicing",
    title: "Folios your\nfinance team trusts.",
    description:
      "Branded documents, configurable taxes, and controls where money moves.",
    bullets: [
      "Guest billing and folio management",
      "Hotel-branded receipts and invoices",
      "VAT, city tax, and tourism levies per region",
      "Refunds and voids with manager authorisation",
      "Design goal: no stray unbilled charges",
      "Payment provider integration at property",
    ],
    badge: "P0",
    urlLabel: "app.xyvoo.com / billing",
  },
  {
    id: "cmms",
    number: "07 — CMMS / Maintenance",
    title: "Assets and work orders,\nin one loop.",
    description:
      "Track equipment, preventive schedules, and resolution — from fault to fixed.",
    bullets: [
      "Work order creation and routing",
      "Asset register with location",
      "Fault intake from housekeeping and staff",
      "Preventive maintenance scheduling",
      "Resolution tracking",
    ],
    badge: "P1",
    urlLabel: "app.xyvoo.com / maintenance",
  },
  {
    id: "procurement",
    number: "08 — Procurement & inventory",
    title: "Stock and spend,\nunder control.",
    description:
      "Vendors, approvals, receiving, and levels — including F&B operational inventory.",
    bullets: [
      "Vendor register with contacts and lead times",
      "Purchase orders with approval above thresholds",
      "Goods receiving",
      "Stock level tracking",
      "Operational inventory for F&B and ops",
    ],
    badge: "P1",
    urlLabel: "app.xyvoo.com / procurement",
  },
  {
    id: "hr",
    number: "09 — HR & scheduling",
    title: "Your team,\nrostered fairly.",
    description:
      "Records, shifts, time capture, and exports finance can use.",
    bullets: [
      "Staff records",
      "Roster and scheduling",
      "Clock-in / clock-out",
      "Leave requests and approvals",
      "Payroll export",
    ],
    badge: "P1",
    urlLabel: "app.xyvoo.com / hr",
  },
  {
    id: "analytics",
    number: "10 — Analytics & reporting",
    title: "Operational truth,\nwithout the noise.",
    description:
      "Tenant-scoped dashboards and revenue views — OLAP-backed reporting separated from live operations.",
    bullets: [
      "Operational dashboards per tenant",
      "Revenue reporting",
      "ClickHouse OLAP for heavy analytical queries",
      "Executive summaries for owner-style roles",
      "V1 data capture ready for future AI layers",
    ],
    badge: "P0 · P1",
    urlLabel: "app.xyvoo.com / analytics",
  },
];

export const SOLUTIONS_HOTEL_INTEGRATIONS_TITLE = "Integrations";
export const SOLUTIONS_HOTEL_INTEGRATIONS_INTRO =
  "Configurable per tenant — turn channels on when you’re ready.";
export const SOLUTIONS_HOTEL_INTEGRATIONS_ITEMS: string[] = [
  "OTA channels (Booking.com, Expedia, and similar)",
  "Payment providers",
  "Accounting systems",
  "Smart locks (optional)",
  "WhatsApp notifications — admin opt-in at signup",
];

export const SOLUTIONS_HOTEL_ONBOARDING_TITLE = "Onboarding & admin";
export const SOLUTIONS_HOTEL_ONBOARDING_ITEMS: string[] = [
  "4-step signup: Hotel details → Verify & secure → Choose plan → Dashboard",
  "Tenant provisioned in under 60 seconds after signup completes",
  "Setup checklist — 12 items, progress %, non-blocking",
  "PWA install banner with QR at dashboard entry",
  "Subdomain changeable once within the first 30 days",
  "14-day free trial — no card required; Pay Now optional",
  "Multi-property — add properties from admin after first signup",
];

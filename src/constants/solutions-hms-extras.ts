import { SOLUTIONS_HOTEL_STACK_MODULES } from "@/constants/solutions-hotel";

export type HmsExtraFeature = {
  id: string;
  number: string;
  title: string;
  description: string;
  bullets: string[];
  badge: string;
};

export type HmsExtraPage = {
  id: string;
  eyebrow: string;
  title: string;
  subtitle: string;
  /** Section order/selection for HmsExtraLanding. Omitted = the original
   * order (fine-print list, then onboarding, then the arc-card stack) used
   * by the three feature sub-pages — left untouched. "compact" drops the
   * arc-card stack entirely (a fast, simple page for a small/solo audience).
   * "rich" leads with the arc-card stack right after At a Glance (a fuller,
   * more impressive-looking page for an enterprise/scaling audience). */
  layout?: "compact" | "rich";
  /** "rich" layout only — bold qualitative callouts for SolutionStatBand. */
  stats?: { headline: string; label: string }[];
  features: HmsExtraFeature[];
  growth: {
    eyebrow: string;
    title: string;
    subtitle: string;
    tagline: string;
  };
  integrations: {
    title: string;
    intro: string;
    items: { title: string; description: string }[];
  };
  onboarding: {
    heading: string;
    cards: { id: string; title: string; description: string; explanation: string }[];
  };
};

export type HmsSiblingLink = {
  id: string;
  title: string;
  description: string;
  href: string;
};

/** Every HMS solution page, for cross-linking each hero to the others —
 * mirrors the pattern used in the About page hero. */
const HMS_ALL_PAGES: HmsSiblingLink[] = [
  {
    id: "hms",
    title: "Hotel Management System",
    description: "The full HMS overview: every department, one system.",
    href: "/solution/hms",
  },
  {
    id: "guest-experience",
    title: "Guest Experience",
    description: "Rooms, reservations and front office.",
    href: "/solution/hms/guest-experience",
  },
  {
    id: "operations",
    title: "Operations & Facilities",
    description: "Housekeeping, maintenance and procurement.",
    href: "/solution/hms/operations",
  },
  {
    id: "finance-analytics",
    title: "Finance, HR & Analytics",
    description: "Staff, F&B revenue, billing and reporting.",
    href: "/solution/hms/finance-analytics",
  },
  {
    id: "independent-hotels",
    title: "Independent Hotels",
    description: "A single property, running on one simple system.",
    href: "/business-types/independent-hotels",
  },
  {
    id: "hotel-groups",
    title: "Hotel Groups & Multi-Property",
    description: "Multiple properties, one connected view.",
    href: "/business-types/hotel-groups",
  },
];

export function hmsSiblingLinks(excludeId: string): HmsSiblingLink[] {
  return HMS_ALL_PAGES.filter((p) => p.id !== excludeId);
}

/** Badges per source module id — kept separate from solutions-hotel.ts since
 * that file has no badge concept; this repackages the same module copy
 * (single source of truth) into grouped, renumbered sub-pages instead of
 * duplicating description/bullet text. */
const BADGES: Record<string, string> = {
  pms: "Live",
  crs: "OTA Synced",
  "front-office": "Live",
  housekeeping: "Real-time",
  cmms: "Automated",
  procurement: "Live",
  hr: "Live",
  "fb-pos": "Live",
  billing: "Automated",
  analytics: "Live Data",
};

/** Fuller, paragraph-length descriptions for the fine-print feature list on
 * these sub-pages, which reads as the important, text-first summary of each
 * module — kept separate from solutions-hotel.ts's own short descriptions
 * (used on the main /solution/hms page, which stays untouched) rather than
 * lengthening those directly. */
const DESCRIPTIONS_LONG: Record<string, string> = {
  pms:
    "Every room is tracked from a single board: its type, floor, rate and current status, whether that's clean, dirty, occupied or out of order. Housekeeping sees the same status the front desk does, the moment it changes, so nobody sells a room that isn't actually ready.",
  crs:
    "Create, amend or cancel a booking from one screen, and every connected channel (Booking.com, Expedia, your own website) updates within seconds. Rates and availability stay aligned everywhere, so a room never gets sold twice by two different channels.",
  "front-office":
    "Arrivals and departures run from a single screen: guest profiles, room assignment and walk-ins handled without switching systems or reaching for a paper log. Check-out closes the guest's folio automatically, so nothing needs re-keying at the end of the stay.",
  housekeeping:
    "Shift-based run sheets give your team a clear, ordered list of what needs doing and when, instead of a verbal handover at the start of a shift. Faults spotted along the way (a broken fixture, a leak) are flagged to maintenance immediately, not written down and forgotten.",
  hr:
    "Staff records, rosters, shifts and leave requests all live in one place, visible to whoever needs them. Clock-ins are captured automatically and exported in a format your finance team can run payroll from directly, without re-entering a single hour by hand.",
  "fb-pos":
    "Point-of-sale built specifically for hotel F&B. Orders go straight from the table to the kitchen screen, and every charge posts cleanly to the right outlet or guest folio. Voids and refunds require manager sign-off, so nothing slips through unnoticed.",
  billing:
    "Every charge (from the room, F&B or housekeeping) lands on the right folio automatically, so nothing gets missed or billed twice. Receipts and invoices carry your hotel's own branding, with local taxes calculated and applied without manual configuration.",
  cmms:
    "A fault reported anywhere on the property (by housekeeping, front desk or a guest) becomes a work order automatically, tracked from report through to resolution. Preventive maintenance is scheduled against a full asset register, so equipment gets serviced before it fails.",
  procurement:
    "Vendors, purchase orders, approvals and stock levels (including F&B operational inventory) sit in one register instead of scattered spreadsheets. Orders above your threshold route for approval automatically, and stock stays visible from order right through to delivery.",
  analytics:
    "Every department feeds the same live dashboard, so a manager doesn't need to chase five separate reports to see how the property is doing today. Revenue reporting for ownership runs on the same underlying data, kept separate from day-to-day operations so neither one slows the other down.",
};

function pickModules(ids: string[]): HmsExtraFeature[] {
  return ids.map((id, index) => {
    const source = SOLUTIONS_HOTEL_STACK_MODULES.find((m) => m.id === id);
    if (!source) throw new Error(`Unknown HMS module id: ${id}`);
    const shortTitle = source.number.split(". ").slice(1).join(". ").trim() || source.number;
    return {
      id: source.id,
      number: `${String(index + 1).padStart(2, "0")}. ${shortTitle}`,
      title: source.title,
      description: DESCRIPTIONS_LONG[source.id] ?? source.description,
      bullets: source.bullets,
      badge: BADGES[source.id] ?? "Live",
    };
  });
}

export const HMS_GUEST_EXPERIENCE: HmsExtraPage = {
  id: "guest-experience",
  eyebrow: "HMS · Guest Experience",
  title: "From booking to check-out, without the friction.",
  subtitle:
    "Rooms, reservations and front office: the guest-facing side of your property, connected in real time.",
  features: pickModules(["pms", "crs", "front-office"]),
  growth: {
    eyebrow: "Front of house",
    title: "Every stay, one system.",
    subtitle:
      "Rooms, reservations and front office: the guest-facing side of your property, connected in real time.",
    tagline: "Still just one system, not three separate logs for rooms, bookings and the front desk.",
  },
  integrations: {
    title: "Where this shows up",
    intro: "None of this lives in its own silo. It's wired into the rest of your property.",
    items: [
      {
        title: "Housekeeping",
        description: "Room status updates from PMS reach housekeeping's board immediately, with no phone calls between departments.",
      },
      {
        title: "Billing",
        description: "Every charge from check-in follows the guest straight onto their folio.",
      },
      {
        title: "Channel Manager",
        description: "Reservations made through Booking.com or Expedia land in the same board as walk-ins.",
      },
    ],
  },
  onboarding: {
    heading: "From setup to first check-in.",
    cards: [
      {
        id: "rooms",
        title: "Set up your rooms",
        description:
          "Room types, floors, rates and every unit's current status, set up once and ready in your dashboard from day one.",
        explanation:
          "Once rooms are set up, front desk and housekeeping both see the exact same live status immediately, with no separate spreadsheet that's a day out of date.",
      },
      {
        id: "channels",
        title: "Connect your booking channels",
        description:
          "Sync rates and availability with Booking.com and Expedia, so every channel reflects the same inventory in real time.",
        explanation:
          "Reservations from every channel land in the same board as walk-ins and direct bookings, so nothing gets double-booked because two systems disagreed.",
      },
      {
        id: "checkin",
        title: "Check guests in",
        description:
          "Assign rooms and handle walk-ins from one screen, without switching between separate check-in and reservation tools.",
        explanation:
          "No separate paper trail: guest profiles and folios start the moment check-in happens, and follow the guest through the rest of their stay automatically.",
      },
    ],
  },
};

export const HMS_OPERATIONS: HmsExtraPage = {
  id: "operations",
  eyebrow: "HMS · Operations & Facilities",
  title: "The back-of-house, running without chaos.",
  subtitle:
    "Housekeeping, maintenance and procurement: the operational side of your property, kept in sync.",
  features: pickModules(["housekeeping", "cmms", "procurement"]),
  growth: {
    eyebrow: "Back of house",
    title: "Nothing falls through the cracks.",
    subtitle:
      "Housekeeping, maintenance and procurement: the operational side of your property, kept in sync.",
    tagline: "Still just one system, not three clipboards nobody reads twice.",
  },
  integrations: {
    title: "Where this shows up",
    intro: "None of this lives in its own silo. It's wired into the rest of your property.",
    items: [
      {
        title: "Front Office",
        description: "A room marked dirty or out-of-order reflects instantly on the front desk's room board.",
      },
      {
        title: "F&B",
        description: "Procurement's stock levels cover F&B inventory too: one register, not two.",
      },
      {
        title: "Analytics",
        description: "Maintenance and housekeeping turnaround times feed the same reporting dashboard as the rest of your property.",
      },
    ],
  },
  onboarding: {
    heading: "Get the back-of-house running.",
    cards: [
      {
        id: "housekeeping",
        title: "Set up housekeeping run sheets",
        description:
          "Shift-based run sheets, built for the way housekeeping actually works, not a static checklist nobody opens.",
        explanation:
          "Room status changes reach the front desk the moment they happen, so nobody ends up selling a room that isn't actually clean, and supervisors can see coverage across every floor without walking it themselves.",
      },
      {
        id: "maintenance",
        title: "Turn on maintenance tracking",
        description:
          "Every fault reported anywhere on the property becomes a trackable work order automatically, not a note left on someone's desk.",
        explanation:
          "Each fault is tracked from the moment it's reported through to resolution, with a full history kept for the next inspection, so nothing gets fixed twice, or missed entirely.",
      },
      {
        id: "procurement",
        title: "Connect procurement",
        description:
          "Vendors, purchase approvals and stock levels (including F&B) all sit in one register instead of scattered spreadsheets.",
        explanation:
          "Purchase orders above your threshold route for approval automatically, so nothing gets bought without sign-off, and stock stays visible from the moment it's ordered to the moment it arrives.",
      },
    ],
  },
};

export const HMS_FINANCE_ANALYTICS: HmsExtraPage = {
  id: "finance-analytics",
  eyebrow: "HMS · Finance, HR & Analytics",
  title: "The numbers and the people, both accounted for.",
  subtitle:
    "Staff, F&B revenue, billing and reporting: the side of your property that has to add up.",
  features: pickModules(["hr", "fb-pos", "billing", "analytics"]),
  growth: {
    eyebrow: "The numbers",
    title: "Every department, one ledger.",
    subtitle:
      "Staff, F&B revenue, billing and reporting: the side of your property that has to add up.",
    tagline: "Still just one system, not a spreadsheet finance has to rebuild every month.",
  },
  integrations: {
    title: "Where this shows up",
    intro: "None of this lives in its own silo. It's wired into the rest of your property.",
    items: [
      {
        title: "Front Office",
        description: "Every charge from check-in, F&B or housekeeping lands on the same guest folio automatically.",
      },
      {
        title: "Procurement",
        description: "Payroll and vendor spend both flow into the same financial reporting, not two disconnected ledgers.",
      },
      {
        title: "Housekeeping",
        description: "Departmental dashboards pull live data from every station, not just finance's own records.",
      },
    ],
  },
  onboarding: {
    heading: "Get the numbers flowing.",
    cards: [
      {
        id: "staff",
        title: "Set up staff and rosters",
        description:
          "Shifts, clock-ins and leave requests all captured in one place, visible to managers across every department.",
        explanation:
          "Payroll-ready exports mean finance isn't re-entering a single hour by hand, and rosters stay accurate without a separate spreadsheet to maintain.",
      },
      {
        id: "billing",
        title: "Configure billing rules",
        description:
          "Taxes and folio rules are set once and applied automatically to every charge, whatever department it comes from.",
        explanation:
          "Every charge from any department lands on the right folio without manual entry, so nothing gets missed, duplicated, or billed under the wrong tax rule.",
      },
      {
        id: "dashboards",
        title: "Turn on departmental dashboards",
        description:
          "Live reporting for every station (front desk, housekeeping, F&B), not just the numbers finance keeps to itself.",
        explanation:
          "Revenue and operational data update in real time as the property runs, so managers see the same picture finance does, without waiting on a monthly report.",
      },
    ],
  },
};

export const HMS_INDEPENDENT_HOTELS: HmsExtraPage = {
  id: "independent-hotels",
  layout: "compact",
  eyebrow: "For Independent Hotels",
  title: "One system for a property you run yourself.",
  subtitle:
    "Every department (rooms, reservations, housekeeping, staff, F&B, billing, maintenance, procurement and reporting) in one system built for an owner-operator, not a back office.",
  features: pickModules([
    "pms",
    "crs",
    "front-office",
    "housekeeping",
    "hr",
    "fb-pos",
    "billing",
    "cmms",
    "procurement",
    "analytics",
  ]),
  growth: {
    eyebrow: "Built for owner-operators",
    title: "Everything a small property actually needs.",
    subtitle:
      "Every department (rooms, reservations, housekeeping, staff, F&B, billing, maintenance, procurement and reporting) in one system built for an owner-operator, not a back office.",
    tagline: "Still just one system, not a PMS, a POS and a spreadsheet stitched together.",
  },
  integrations: {
    title: "Where this shows up",
    intro: "None of this lives in its own silo. It's wired into the rest of your property.",
    items: [
      {
        title: "Housekeeping",
        description: "Room status from the front desk reaches housekeeping's board immediately, with no separate whiteboard to keep up to date.",
      },
      {
        title: "Reservations",
        description: "Every booking, whether a walk-in or from an OTA, lands on the same room board your team already checks.",
      },
      {
        title: "Billing",
        description: "Every charge from the room, F&B or housekeeping follows the guest straight onto their folio.",
      },
      {
        title: "Maintenance",
        description: "A fault reported by any department becomes a work order automatically, without a second phone call.",
      },
      {
        title: "Reporting",
        description: "Occupancy and revenue for the night are ready the next morning, without a spreadsheet to rebuild by hand.",
      },
    ],
  },
  onboarding: {
    heading: "Live in an afternoon, not a quarter.",
    cards: [
      {
        id: "rooms",
        title: "Set up your rooms",
        description:
          "Room types, floors and rates entered once, ready in your dashboard the same day you sign up.",
        explanation:
          "No implementation project to wait on. A single owner-operator can set this up alone, without a dedicated IT person.",
      },
      {
        id: "checkin",
        title: "Start checking guests in",
        description:
          "Assign rooms and handle walk-ins from one screen, the same day your rooms are set up.",
        explanation:
          "Guest profiles and folios start automatically at check-in, so there's no separate paper register to maintain alongside it.",
      },
      {
        id: "billing",
        title: "Get paid without the spreadsheet",
        description:
          "Every charge lands on the guest's folio automatically, with taxes applied the way your property needs them.",
        explanation:
          "Receipts carry your own property's name, not a generic template, and there's no separate accounting tool to reconcile against at month end.",
      },
    ],
  },
};

/** Hand-authored, not pulled via pickModules() — these describe multi-property
 * capabilities a portfolio actually needs (cross-property rates, group
 * reporting, a shared guest profile, group procurement) that go beyond the
 * single-property module set. Badged "Planned" rather than "Live" since none
 * of this exists in XYVOO yet; this page is doubling as a roadmap brief. */
const HOTEL_GROUPS_FEATURES: HmsExtraFeature[] = [
  {
    id: "portfolio-dashboard",
    number: "01. Portfolio Dashboard",
    title: "Every property,\none login.",
    description:
      "A single dashboard shows occupancy, revenue and performance across every property in the portfolio, with drill-down into any one property's own numbers when you need the detail.",
    bullets: [
      "Portfolio-wide view of occupancy, ADR and revenue, updated in real time",
      "Drill down from the group view into any single property's own dashboard",
    ],
    badge: "Planned",
  },
  {
    id: "cross-property-rates",
    number: "02. Cross-Property Rates & Inventory",
    title: "Set once,\napply everywhere.",
    description:
      "Push rates and room allotments to every property at once, or override individually where one property needs its own pricing, without logging into each property separately.",
    bullets: [
      "Bulk rate and allotment changes across the whole portfolio in one action",
      "Per-property overrides for local pricing, without affecting the rest",
    ],
    badge: "Planned",
  },
  {
    id: "group-benchmarking",
    number: "03. Group Reporting & Benchmarking",
    title: "See which property\nneeds attention.",
    description:
      "Compare every property side by side on the numbers that matter, such as RevPAR, ADR, occupancy and F&B revenue, so an underperforming property is obvious before it becomes a crisis.",
    bullets: [
      "Side-by-side property comparison on every key metric, not five separate reports",
      "Automatic flags when a property drifts from the portfolio average",
    ],
    badge: "Planned",
  },
  {
    id: "unified-guest-profile",
    number: "04. Unified Guest Profiles",
    title: "One guest,\nrecognised everywhere.",
    description:
      "A guest who stayed at one property is recognised the moment they book or check in at any other property in the group. Their history, preferences and loyalty status travel with them.",
    bullets: [
      "Guest history and preferences shared across every property in the group",
      "No more re-entering the same guest as a stranger at a different property",
    ],
    badge: "Planned",
  },
  {
    id: "group-loyalty",
    number: "05. Centralized Loyalty Program",
    title: "One loyalty scheme,\nnot one per site.",
    description:
      "Guests earn and redeem points across every property in the portfolio, not just the one they're staying at. That's a stronger reason to keep booking within the group.",
    bullets: [
      "Points earned at one property redeemable at any other in the group",
      "Managed centrally, with reporting on redemption across the whole portfolio",
    ],
    badge: "Planned",
  },
  {
    id: "group-procurement",
    number: "06. Group Procurement & Vendor Contracts",
    title: "Negotiate once,\nbuy everywhere.",
    description:
      "Set a vendor contract and pricing once at group level, and every property purchasing against that vendor automatically gets the negotiated rate, instead of each property negotiating on its own.",
    bullets: [
      "Group-wide vendor contracts and pricing, applied automatically per property",
      "Portfolio-wide spend visibility by vendor, not scattered across properties",
    ],
    badge: "Planned",
  },
  {
    id: "regional-access",
    number: "07. Role-Based Access by Region & Property",
    title: "The right view,\nfor the right person.",
    description:
      "Corporate sees the whole portfolio, a regional manager sees their region, and a property GM sees only their own property. It's one system, scoped correctly for every level of the organisation.",
    bullets: [
      "Corporate, regional and property-level roles, each scoped to what they need",
      "No property seeing another property's data by accident",
    ],
    badge: "Planned",
  },
  {
    id: "brand-standards",
    number: "08. Brand Standards & SOP Compliance",
    title: "The same standard,\nat every property.",
    description:
      "Roll out checklists and standard operating procedures to every property from one place, and track compliance centrally, so brand standards don't quietly drift property by property.",
    bullets: [
      "Checklists and SOPs pushed to every property from one place",
      "Central compliance tracking, not a spreadsheet per property",
    ],
    badge: "Planned",
  },
  {
    id: "consolidated-financials",
    number: "09. Consolidated Financial Rollup",
    title: "One P&L,\nevery property in it.",
    description:
      "A consolidated financial view rolls every property's numbers up into one portfolio-level P&L, with the ability to drill back down into any single property's own books.",
    bullets: [
      "One consolidated P&L across the whole portfolio",
      "Drill down into any property's own financials without leaving the rollup",
    ],
    badge: "Planned",
  },
  {
    id: "inter-property-transfers",
    number: "10. Inter-Property Transfers",
    title: "Move staff and stock,\nwithout starting over.",
    description:
      "Transfer a staff member or stock between properties without re-provisioning them from scratch. Their record, access and history move with them.",
    bullets: [
      "Staff transferred between properties keep their record and access history",
      "Stock transfers between properties tracked the same way as any other movement",
    ],
    badge: "Planned",
  },
];

export const HMS_HOTEL_GROUPS: HmsExtraPage = {
  id: "hotel-groups",
  layout: "rich",
  eyebrow: "For Hotel Groups & Multi-Property",
  title: "Every property, one connected view.",
  subtitle:
    "Portfolio-wide rates, a shared guest profile, group procurement and consolidated reporting: the layer a single-property system doesn't give you once you're running more than one.",
  stats: [
    { headline: "One login", label: "for every property in the portfolio, not one per site" },
    { headline: "Three access levels", label: "corporate, regional and property, each scoped to what they need" },
    { headline: "One consolidated P&L", label: "not a spreadsheet stitched together from five properties" },
  ],
  features: HOTEL_GROUPS_FEATURES,
  growth: {
    eyebrow: "Built to scale",
    title: "Grows the way a portfolio actually grows.",
    subtitle:
      "Portfolio-wide rates, a shared guest profile, group procurement and consolidated reporting: the layer a single-property system doesn't give you once you're running more than one.",
    tagline: "Still just one system, not one login per property to keep track of.",
  },
  integrations: {
    title: "Where this shows up",
    intro: "None of this lives in its own silo. It's wired into the rest of every property.",
    items: [
      {
        title: "Front Office",
        description: "A guest recognised centrally still checks in through each property's own front desk, no extra step for staff.",
      },
      {
        title: "Reservations",
        description: "Cross-property rate changes reach every property's own reservation board the moment they're published.",
      },
      {
        title: "Billing",
        description: "Every property's charges roll up into the same consolidated financial reporting, not a separate ledger per site.",
      },
      {
        title: "Procurement",
        description: "Group vendor contracts apply automatically the moment any property raises a purchase order against them.",
      },
      {
        title: "Analytics",
        description: "Portfolio benchmarking pulls from the same live data each property's own dashboard already shows.",
      },
    ],
  },
  onboarding: {
    heading: "Bring every property onto one system.",
    cards: [
      {
        id: "portfolio",
        title: "Set up your portfolio dashboard",
        description:
          "Add every property once, and see occupancy, revenue and performance across all of them from a single login.",
        explanation:
          "Corporate, regional and property-level roles are scoped from the start, so nobody sees more than they should.",
      },
      {
        id: "rates",
        title: "Push rates across every property",
        description:
          "Set rates and allotments once at group level, with the option to override per property where you need to.",
        explanation:
          "Every property's own reservation board reflects the change immediately, with no per-property re-entry.",
      },
      {
        id: "reporting",
        title: "Turn on group-wide reporting",
        description:
          "Benchmark every property against the rest of the portfolio, and drill into any one property's own numbers on demand.",
        explanation:
          "An underperforming property is visible immediately, instead of surfacing weeks later in a monthly review.",
      },
    ],
  },
};

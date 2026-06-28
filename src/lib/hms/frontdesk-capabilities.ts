/**
 * Front Desk PRD v1 — capability registry (UI shell).
 * Keys are stable URLs under /hms/[slug]/frontdesk/wip/[key]
 */

export type FrontDeskAccent =
  | "checkin"
  | "rooms"
  | "guest"
  | "incidents"
  | "financial"
  | "night"
  | "admin";

/** Left-border accent (PRD categories), tuned for light cards like HMS dashboard. */
export const FRONT_DESK_ACCENT_BORDER_CLASS: Record<FrontDeskAccent, string> = {
  checkin: "border-l-blue-500",
  rooms: "border-l-teal-500",
  guest: "border-l-amber-500",
  incidents: "border-l-orange-500",
  financial: "border-l-emerald-500",
  night: "border-l-violet-500",
  admin: "border-l-slate-400",
};

/** Icon well + icon colour (matches dashboard snapshot / quick-link energy). */
export const FRONT_DESK_ACCENT_WELL_CLASS: Record<FrontDeskAccent, string> = {
  checkin: "bg-blue-50 text-blue-600",
  rooms: "bg-teal-50 text-teal-600",
  guest: "bg-amber-50 text-amber-600",
  incidents: "bg-orange-50 text-orange-600",
  financial: "bg-emerald-50 text-emerald-600",
  night: "bg-violet-50 text-violet-600",
  admin: "bg-slate-100 text-slate-600",
};

/** Sidebar / route grouping for split front desk UX. */
export type FrontDeskNavArea =
  | "overview"
  | "arrivals"
  | "rooms"
  | "guestServices"
  | "requests"
  | "folio"
  | "checkout"
  | "night"
  | "reports";

export type FrontDeskCapability = {
  key: string;
  title: string;
  subtitle: string;
  accent: FrontDeskAccent;
};

export type FrontDeskSectionBlock = {
  type: "section";
  id: string;
  title: string;
  eyebrow?: string;
  area: FrontDeskNavArea;
  cards: FrontDeskCapability[];
};

export type FrontDeskDividerBlock = {
  type: "divider";
  label: string;
  area: FrontDeskNavArea;
};

export type FrontDeskPageBlock = FrontDeskSectionBlock | FrontDeskDividerBlock;

export const FRONT_DESK_PAGE_BLOCKS: FrontDeskPageBlock[] = [
  {
    type: "section",
    id: "dashboard-kpis",
    title: "Dashboard — always visible",
    eyebrow: "Section 1",
    area: "overview",
    cards: [
      {
        key: "arrivals-kpi",
        title: "Arrivals KPI",
        subtitle: "Expected vs checked in, live",
        accent: "checkin",
      },
      {
        key: "departures-kpi",
        title: "Departures KPI",
        subtitle: "Expected vs checked out, live",
        accent: "checkin",
      },
      {
        key: "in-house-count",
        title: "In-house count",
        subtitle: "Total guests on property",
        accent: "checkin",
      },
      {
        key: "rooms-ready",
        title: "Rooms ready",
        subtitle: "Clean and inspected",
        accent: "rooms",
      },
      {
        key: "open-requests",
        title: "Open requests",
        subtitle: "SLA status at a glance",
        accent: "incidents",
      },
      {
        key: "vip-arrivals",
        title: "VIP arrivals",
        subtitle: "Today's flagged guests",
        accent: "guest",
      },
      {
        key: "overdue-checkouts",
        title: "Overdue checkouts",
        subtitle: "Alert if past checkout time",
        accent: "incidents",
      },
      {
        key: "unpreauthed-rooms",
        title: "Unpre-auth'd rooms",
        subtitle: "Payment not captured",
        accent: "financial",
      },
    ],
  },
  { type: "divider", label: "Agent takes action", area: "arrivals" },
  {
    type: "section",
    id: "arrival-workflow",
    title: "Arrival workflow",
    eyebrow: "Section 2",
    area: "arrivals",
    cards: [
      {
        key: "pre-arrival-list",
        title: "Pre-arrival list",
        subtitle: "Sorted by expected time",
        accent: "admin",
      },
      {
        key: "pre-assign-rooms",
        title: "Pre-assign rooms",
        subtitle: "Before guest arrives",
        accent: "checkin",
      },
      {
        key: "add-welcome-note",
        title: "Add welcome note",
        subtitle: "Dispatched to departments",
        accent: "checkin",
      },
      {
        key: "check-in-search",
        title: "Check-in — search",
        subtitle: "Name, ref, phone, email",
        accent: "checkin",
      },
      {
        key: "guest-profile-load",
        title: "Guest profile load",
        subtitle: "Full history at a glance",
        accent: "checkin",
      },
      {
        key: "room-assignment",
        title: "Room assignment",
        subtitle: "Filter by type, floor, view",
        accent: "checkin",
      },
      {
        key: "id-verification",
        title: "ID verification",
        subtitle: "Scan or photograph",
        accent: "checkin",
      },
      {
        key: "payment-capture",
        title: "Payment capture",
        subtitle: "Pre-auth or VCC",
        accent: "checkin",
      },
      {
        key: "special-requests-confirm",
        title: "Special requests confirm",
        subtitle: "Verbal check with guest",
        accent: "admin",
      },
      {
        key: "issue-key",
        title: "Issue key",
        subtitle: "Digital or physical",
        accent: "checkin",
      },
      {
        key: "open-folio",
        title: "Open folio",
        subtitle: "Stay billing starts",
        accent: "checkin",
      },
      {
        key: "walk-in-booking",
        title: "Walk-in booking",
        subtitle: "Same screen, no switch",
        accent: "checkin",
      },
    ],
  },
  {
    type: "section",
    id: "room-management",
    title: "Room management",
    eyebrow: "Section 3",
    area: "rooms",
    cards: [
      {
        key: "room-status-board",
        title: "Room status board",
        subtitle: "Full floor plan, live status",
        accent: "rooms",
      },
      {
        key: "change-room-assignment",
        title: "Change room assignment",
        subtitle: "Folio transfers automatically",
        accent: "rooms",
      },
      {
        key: "block-room",
        title: "Block a room",
        subtitle: "OOO (Out of Order) with reason",
        accent: "rooms",
      },
      {
        key: "remote-unlock",
        title: "Remote unlock",
        subtitle: "One-click for locked-out guest",
        accent: "rooms",
      },
      {
        key: "priority-clean-request",
        title: "Priority clean request",
        subtitle: "Guest waiting in lobby",
        accent: "rooms",
      },
      {
        key: "lost-key-reissue",
        title: "Lost key / reissue",
        subtitle: "Old revoked, new issued",
        accent: "rooms",
      },
      {
        key: "room-move",
        title: "Room move",
        subtitle: "Full transfer in one action",
        accent: "rooms",
      },
      {
        key: "connecting-rooms",
        title: "Connecting rooms",
        subtitle: "Link pairs for families",
        accent: "rooms",
      },
    ],
  },
  {
    type: "section",
    id: "guest-management",
    title: "Guest management",
    eyebrow: "Section 4 — Guest in-house",
    area: "guestServices",
    cards: [
      {
        key: "guest-profile",
        title: "Guest profile",
        subtitle: "History, prefs, loyalty, VIP",
        accent: "guest",
      },
      {
        key: "add-agent-note",
        title: "Add agent note",
        subtitle: "Persists across all stays",
        accent: "guest",
      },
      {
        key: "set-vip-flag",
        title: "Set VIP flag",
        subtitle: "Tier + treatment instructions",
        accent: "guest",
      },
      {
        key: "set-do-not-walk",
        title: "Set Do Not Walk",
        subtitle: "Protection from overbooking",
        accent: "guest",
      },
      {
        key: "send-message",
        title: "Send message",
        subtitle: "WhatsApp / SMS to guest",
        accent: "guest",
      },
      {
        key: "broadcast-message",
        title: "Broadcast message",
        subtitle: "All in-house or filtered group",
        accent: "guest",
      },
      {
        key: "group-check-in",
        title: "Group check-in",
        subtitle: "Bulk from rooming list",
        accent: "guest",
      },
      {
        key: "parcel-management",
        title: "Parcel management",
        subtitle: "Log, notify, collect",
        accent: "guest",
      },
      {
        key: "accessibility-flags",
        title: "Accessibility flags",
        subtitle: "Pushed to all departments",
        accent: "guest",
      },
      {
        key: "upsell-prompts",
        title: "Upsell prompts",
        subtitle: "Upgrade, breakfast, late checkout",
        accent: "guest",
      },
    ],
  },
  {
    type: "section",
    id: "requests-incidents",
    title: "Requests, complaints & incidents",
    eyebrow: "Section 5",
    area: "requests",
    cards: [
      {
        key: "log-service-request",
        title: "Log service request",
        subtitle: "Auto-routed to department",
        accent: "incidents",
      },
      {
        key: "track-sla-status",
        title: "Track SLA status",
        subtitle: "Pending / In progress / Breach",
        accent: "incidents",
      },
      {
        key: "escalate-to-manager",
        title: "Escalate to manager",
        subtitle: "Triggered on SLA breach",
        accent: "incidents",
      },
      {
        key: "log-complaint",
        title: "Log complaint",
        subtitle: "Folio-linked, category + priority",
        accent: "incidents",
      },
      {
        key: "log-incident",
        title: "Log incident",
        subtitle: "Formal record, permanent",
        accent: "incidents",
      },
      {
        key: "notify-guest-on-resolve",
        title: "Notify guest on resolve",
        subtitle: "Auto via WhatsApp",
        accent: "incidents",
      },
      {
        key: "waitlist-management",
        title: "Waitlist management",
        subtitle: "Alert on room availability",
        accent: "incidents",
      },
    ],
  },
  {
    type: "section",
    id: "financial-folio",
    title: "Financial & folio",
    eyebrow: "Section 6",
    area: "folio",
    cards: [
      {
        key: "view-live-folio",
        title: "View live folio",
        subtitle: "All charges, real-time",
        accent: "financial",
      },
      {
        key: "post-manual-charge",
        title: "Post manual charge",
        subtitle: "Parking, transfers, spa",
        accent: "financial",
      },
      {
        key: "apply-discount",
        title: "Apply discount",
        subtitle: "Manager PIN required",
        accent: "financial",
      },
      {
        key: "split-folio",
        title: "Split folio",
        subtitle: "Company vs personal",
        accent: "financial",
      },
      {
        key: "transfer-charge",
        title: "Transfer charge",
        subtitle: "Between guest folios",
        accent: "financial",
      },
      {
        key: "mid-stay-payment",
        title: "Mid-stay payment",
        subtitle: "Partial settlement",
        accent: "financial",
      },
      {
        key: "preview-share-bill",
        title: "Preview & share bill",
        subtitle: "Send to guest phone",
        accent: "financial",
      },
      {
        key: "foreign-currency",
        title: "Foreign currency",
        subtitle: "Live rate, logged on receipt",
        accent: "financial",
      },
      {
        key: "corporate-billing",
        title: "Corporate billing",
        subtitle: "PO reference, direct bill",
        accent: "financial",
      },
      {
        key: "travel-agent-commission",
        title: "Travel agent commission",
        subtitle: "Track and flag for payment",
        accent: "financial",
      },
      {
        key: "cash-float",
        title: "Cash float",
        subtitle: "Open / close / reconcile",
        accent: "financial",
      },
    ],
  },
  { type: "divider", label: "Guest departing", area: "checkout" },
  {
    type: "section",
    id: "checkout-workflow",
    title: "Check-out workflow",
    eyebrow: "Section 7",
    area: "checkout",
    cards: [
      {
        key: "final-folio-review",
        title: "Final folio review",
        subtitle: "All charges itemised",
        accent: "checkin",
      },
      {
        key: "void-charge",
        title: "Void a charge",
        subtitle: "Manager authorisation",
        accent: "checkin",
      },
      {
        key: "settle-payment",
        title: "Settle payment",
        subtitle: "Card / direct bill / VCC",
        accent: "checkin",
      },
      {
        key: "send-receipt",
        title: "Send receipt",
        subtitle: "Email or WhatsApp instantly",
        accent: "checkin",
      },
      {
        key: "revoke-key",
        title: "Revoke key",
        subtitle: "Digital + physical, automatic",
        accent: "checkin",
      },
      {
        key: "early-departure",
        title: "Early departure",
        subtitle: "Rate adj + departure fee",
        accent: "checkin",
      },
      {
        key: "extended-stay",
        title: "Extended stay",
        subtitle: "Room check + auth top-up",
        accent: "checkin",
      },
      {
        key: "express-check-out",
        title: "Express check-out",
        subtitle: "Guest self-serves on phone",
        accent: "checkin",
      },
      {
        key: "collect-feedback",
        title: "Collect feedback",
        subtitle: "QR / link at checkout",
        accent: "checkin",
      },
    ],
  },
  {
    type: "section",
    id: "night-shift",
    title: "Night shift",
    eyebrow: "Section 8",
    area: "night",
    cards: [
      {
        key: "night-audit",
        title: "Night audit",
        subtitle: "Room rate posting, balance",
        accent: "night",
      },
      {
        key: "no-show-processing",
        title: "No-show processing",
        subtitle: "Fee charge, room release",
        accent: "night",
      },
      {
        key: "late-arrival-tracking",
        title: "Late arrival tracking",
        subtitle: "Hold until configured time",
        accent: "night",
      },
      {
        key: "shift-handover-note",
        title: "Shift handover note",
        subtitle: "Structured, system-linked",
        accent: "night",
      },
      {
        key: "distress-check",
        title: "Distress check",
        subtitle: "Wellness flag on solo guests",
        accent: "night",
      },
    ],
  },
  {
    type: "section",
    id: "admin-reporting",
    title: "Admin, compliance & reporting",
    eyebrow: "Section 9",
    area: "reports",
    cards: [
      {
        key: "arrivals-list-report",
        title: "Arrivals list",
        subtitle: "Sortable, filterable, printable",
        accent: "admin",
      },
      {
        key: "departures-list-report",
        title: "Departures list",
        subtitle: "Folio totals + payment status",
        accent: "admin",
      },
      {
        key: "in-house-list-report",
        title: "In-house list",
        subtitle: "Live, emergency-ready",
        accent: "admin",
      },
      {
        key: "room-status-summary",
        title: "Room status summary",
        subtitle: "Counts by status",
        accent: "admin",
      },
      {
        key: "open-requests-report",
        title: "Open requests report",
        subtitle: "SLA health at a glance",
        accent: "admin",
      },
      {
        key: "shift-report",
        title: "Shift report",
        subtitle: "Everything in current shift",
        accent: "admin",
      },
      {
        key: "overbooking-dashboard",
        title: "Overbooking dashboard",
        subtitle: "Sold vs available + walk candidates",
        accent: "admin",
      },
      {
        key: "immigration-export",
        title: "Immigration export",
        subtitle: "Foreign national registration",
        accent: "admin",
      },
      {
        key: "evacuation-roll-call",
        title: "Evacuation roll-call",
        subtitle: "Live in-house, mark accounted",
        accent: "admin",
      },
      {
        key: "night-audit-report",
        title: "Night audit report",
        subtitle: "End-of-day reconciliation",
        accent: "admin",
      },
    ],
  },
];

export const FRONT_DESK_AREA_HERO: Record<
  FrontDeskNavArea,
  { title: string; description: string }
> = {
  overview: {
    title: "Operational overview",
    description:
      "Use Check In Guest in the header for walk-ins, then scan room status and shift KPIs below.",
  },
  arrivals: {
    title: "Arrivals & check-in",
    description:
      "Pre-arrival through keys and folio — everything an agent needs before the guest is in-house.",
  },
  rooms: {
    title: "Room management",
    description: "Status, assignments, OOO, keys, and moves without leaving the front desk context.",
  },
  guestServices: {
    title: "Guest services",
    description:
      "Log and track guest service requests, SLA, department routing, folio charges, and operational analytics.",
  },
  requests: {
    title: "Requests & incidents",
    description: "Service requests, SLA, complaints, incidents, guest notifications, and waitlists.",
  },
  folio: {
    title: "Financial & folio",
    description: "Live folio, postings, splits, payments, corporate billing, commission, and cash float.",
  },
  checkout: {
    title: "Check-out",
    description: "Final review, settlement, keys, extensions, express checkout, and feedback capture.",
  },
  night: {
    title: "Night shift",
    description: "Night audit, no-shows, late arrivals, handover notes, and wellness checks.",
  },
  reports: {
    title: "Admin & reporting",
    description: "Operational lists, SLA health, compliance exports, roll-call, and night audit reports.",
  },
};

export function getFrontDeskBlocksForArea(area: FrontDeskNavArea): FrontDeskPageBlock[] {
  return FRONT_DESK_PAGE_BLOCKS.filter((block) => block.area === area);
}

const capabilityByKey = new Map<string, FrontDeskCapability>();

for (const block of FRONT_DESK_PAGE_BLOCKS) {
  if (block.type === "section") {
    for (const card of block.cards) {
      capabilityByKey.set(card.key, card);
    }
  }
}

export function getFrontDeskCapabilityByKey(key: string): FrontDeskCapability | undefined {
  return capabilityByKey.get(key);
}

export function getAllFrontDeskCapabilityKeys(): string[] {
  return [...capabilityByKey.keys()];
}

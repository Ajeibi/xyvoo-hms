import type { Resource } from "@/types/resources";

export const RESOURCES: Resource[] = [
  {
    slug: "front-desk-efficiency-checklist",
    title: "The Front Desk Efficiency Checklist",
    summary:
      "A practical, print-and-use checklist for cutting check-in and check-out time without cutting corners — arranged by the four moments that actually cause delay.",
    category: "Operations",
    file: "front-desk-efficiency-checklist.pdf",
    pages: 14,
    readTime: "8 min",
    date: "Apr 2026",
    audience: "Independent hotels and multi-property groups",
    tags: ["front desk", "check-in", "operations"],
  },
  {
    slug: "hotel-revenue-management-field-guide",
    title: "Hotel Revenue Management: A Field Guide",
    summary:
      "ADR, RevPAR and occupancy explained simply, with a worked example you can copy for your own property and a weekly routine for reading the numbers.",
    category: "Revenue",
    file: "hotel-revenue-management-field-guide.pdf",
    pages: 16,
    readTime: "10 min",
    date: "Apr 2026",
    audience: "Independent hotels and revenue managers",
    tags: ["revenue", "adr", "revpar", "pricing"],
  },
  {
    slug: "migrating-front-desk-system-without-downtime",
    title: "Migrating Your Front Desk System Without Downtime",
    summary:
      "A four-phase, step-by-step plan for switching property management systems without a single missed reservation.",
    category: "Technology",
    file: "migrating-front-desk-system-without-downtime.pdf",
    pages: 12,
    readTime: "7 min",
    date: "Apr 2026",
    audience: "Hoteliers switching from a legacy PMS or spreadsheets",
    tags: ["migration", "onboarding", "technology"],
  },
  {
    slug: "paystack-reconciliation-guide-for-hotels",
    title: "Paystack Reconciliation Guide for Hotels",
    summary:
      "A repeatable weekly process for matching Paystack settlements to guest folios, without the month-end scramble.",
    category: "Finance",
    file: "paystack-reconciliation-guide-for-hotels.pdf",
    pages: 12,
    readTime: "6 min",
    date: "Apr 2026",
    audience: "Hotel finance teams and owner-operators",
    tags: ["paystack", "finance", "reconciliation"],
  },
  {
    slug: "storefront-launch-checklist",
    title: "The Storefront Launch Checklist",
    summary:
      "Everything to get right before you open your online storefront to real customers — in the order it actually matters, not the order it's easiest to do.",
    category: "Storefront",
    file: "storefront-launch-checklist.pdf",
    pages: 12,
    readTime: "6 min",
    date: "Apr 2026",
    audience: "Solo sellers and new retail businesses",
    tags: ["storefront", "launch", "ecommerce"],
  },
];

export const RESOURCE_CATEGORIES: Resource["category"][] = [
  "Operations",
  "Revenue",
  "Technology",
  "Finance",
  "Storefront",
];

export function getResourceBySlug(slug: string): Resource | undefined {
  return RESOURCES.find((r) => r.slug === slug);
}

export function getRelatedResources(resource: Resource, max = 3): Resource[] {
  const sameCategory = RESOURCES.filter(
    (r) => r.slug !== resource.slug && r.category === resource.category
  );
  const rest = RESOURCES.filter(
    (r) => r.slug !== resource.slug && r.category !== resource.category
  );
  return [...sameCategory, ...rest].slice(0, max);
}

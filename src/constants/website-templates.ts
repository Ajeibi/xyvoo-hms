import type { WebsiteTemplate, WebsiteTemplatePage } from "@/types";

/**
 * Storefront website templates shown on /templates.
 *
 * Each template is a static site built into /public/template-previews/<slug> by
 * `npm run templates:build` (source: design/storefront-templates/). The previewer
 * frames those files, so visitors see exactly the markup a customer's site ships with.
 */

/** Pages every template has (from design/storefront-templates/_base), in picker order. */
function pagesWith(brandPages: WebsiteTemplatePage[], labels: { journal: string; collections: string }): WebsiteTemplatePage[] {
  return [
    { label: "Home", file: "index.html" },
    { label: "Shop", file: "shop.html" },
    { label: "Product", file: "product.html" },
    { label: labels.collections, file: "collections.html" },
    { label: "Basket", file: "cart.html" },
    { label: "Checkout", file: "checkout.html" },
    { label: "Order confirmation", file: "order-confirmation.html" },
    { label: "Sign in", file: "login.html" },
    { label: "Account", file: "account.html" },
    { label: "Order history", file: "account-orders.html" },
    { label: "Wishlist", file: "wishlist.html" },
    ...brandPages,
    { label: labels.journal, file: "inspiration.html" },
    { label: "Article", file: "article.html" },
    { label: "Contact", file: "contact.html" },
    { label: "Delivery", file: "delivery.html" },
    { label: "Returns", file: "returns.html" },
    { label: "FAQs", file: "faqs.html" },
    { label: "Track order", file: "track-order.html" },
  ];
}

const STOREFRONT_TEMPLATES: WebsiteTemplate[] = [
  {
    slug: "linden-home",
    kind: "storefront",
    name: "Linden Home",
    industry: "Furniture and homeware",
    summary: "A calm, editorial storefront for furniture, homeware and lifestyle brands.",
    description:
      "Warm neutrals, generous photography and a full brand website around the shop: your story, journal, delivery and returns pages, customer accounts and a distraction-free checkout.",
    previewPath: "/template-previews/linden-home",
    pageCount: 33,
    pages: pagesWith(
      [
        { label: "About", file: "about.html" },
        { label: "Sustainability", file: "sustainability.html" },
        { label: "Materials", file: "materials.html" },
      ],
      { journal: "Journal", collections: "Collections" }
    ),
    highlights: [
      "Full brand website, not just a catalogue",
      "Shop with filters, product pages and reviews",
      "Basket, checkout and order confirmation",
      "Customer accounts, order history and wishlist",
      "Journal, delivery, returns and FAQ pages",
      "Built to WCAG 2.2 AA, mobile-first",
    ],
    palette: ["#FAF7F2", "#E6DACB", "#7A4E2D", "#3B3731"],
  },
  {
    slug: "sage-and-stem",
    kind: "storefront",
    name: "Sage & Stem",
    industry: "Skincare, beauty and wellbeing",
    summary: "A soft, botanical storefront for skincare, bath and wellbeing brands.",
    description:
      "Deep olive and cream, serif headlines and arched product frames, with an ingredients guide, a journal for routines and rituals, and everything a beauty shop needs from basket to account.",
    previewPath: "/template-previews/sage-and-stem",
    pageCount: 32,
    pages: pagesWith(
      [
        { label: "About", file: "about.html" },
        { label: "Ingredients", file: "ingredients.html" },
      ],
      { journal: "Journal", collections: "Collections" }
    ),
    highlights: [
      "Arched product frames with badges",
      "Moving launch-sale ribbon, with a pause button",
      "Ingredients guide and product details",
      "Press strip and shop-by-edit tiles",
      "Basket, checkout, accounts and wishlist",
      "Built to WCAG 2.2 AA, mobile-first",
    ],
    palette: ["#FBF8EF", "#E3E2B8", "#4F5D2F", "#2F3A1C"],
  },
  {
    slug: "loftwood",
    kind: "storefront",
    name: "Loftwood",
    industry: "Furniture and home retail",
    summary: "A bright, offer-led storefront for furniture and home retailers with a big range.",
    description:
      "Forest green with a yellow highlight, rounded cards and a busy, confident homepage: shop by room, category tiles, tabbed product collections, deals of the day and a flash sale with a lawful countdown.",
    previewPath: "/template-previews/loftwood",
    pageCount: 31,
    pages: pagesWith([{ label: "About", file: "about.html" }], { journal: "Blog", collections: "Categories" }),
    highlights: [
      "Shop-by-room carousel and category tiles",
      "Tabbed product collections",
      "Sale prices, discount tags and deal timers",
      "Flash sale countdown to a real end date",
      "Basket, checkout, accounts and wishlist",
      "Built to WCAG 2.2 AA, mobile-first",
    ],
    palette: ["#FFFFFF", "#F3F4F1", "#FFB400", "#0B4A2B"],
  },
];

/** Pages every hotel template has (from design/storefront-templates/_base-hotel), in picker order. */
function hotelPages(labels: { rooms: string; wellness: string }): WebsiteTemplatePage[] {
  return [
    { label: "Home", file: "index.html" },
    { label: labels.rooms, file: "rooms.html" },
    { label: "Room details", file: "room.html" },
    { label: "Availability", file: "availability.html" },
    { label: "Book (request form)", file: "book.html" },
    { label: "Request sent", file: "booking-confirmation.html" },
    { label: "Manage a booking", file: "manage-booking.html" },
    { label: "Offers", file: "offers.html" },
    { label: "Dining", file: "dining.html" },
    { label: labels.wellness, file: "wellness.html" },
    { label: "Experiences", file: "experiences.html" },
    { label: "Gallery", file: "gallery.html" },
    { label: "About", file: "about.html" },
    { label: "Contact and getting here", file: "contact.html" },
    { label: "FAQs", file: "faqs.html" },
    { label: "Booking terms", file: "terms.html" },
    { label: "Accessibility", file: "accessibility.html" },
  ];
}

const HOTEL_TEMPLATES: WebsiteTemplate[] = [
  {
    slug: "coral-tide",
    kind: "hotel",
    name: "Coral Tide",
    industry: "Resorts and seaside hotels",
    summary: "A warm, sunlit website for resorts, beach hotels and spa retreats.",
    description:
      "Deep green, sand and cream with elegant serif headlines, a booking bar over the hero, room and experience showcases, and the full booking journey: availability, rates, extras and a request that emails your team. No payment is taken online.",
    previewPath: "/template-previews/coral-tide",
    pageCount: 20,
    pages: hotelPages({ rooms: "Rooms and suites", wellness: "Spa and wellness" }),
    highlights: [
      "Booking bar over the hero",
      "Availability with rate plans and stay totals",
      "Booking request with extras and a live summary",
      "Requests go to your inbox; no online payment",
      "Dining, spa, experiences and offers pages",
      "Built to WCAG 2.2 AA, mobile-first",
    ],
    palette: ["#FAF6EF", "#E8D5B9", "#1F3A34", "#D8B79A"],
  },
  {
    slug: "fernhollow",
    kind: "hotel",
    name: "Fernhollow",
    industry: "Lodges, cabins and glamping",
    summary: "A natural, friendly website for eco lodges, cabins and holiday parks.",
    description:
      "Forest greens, rounded shapes and a pill-shaped search bar, with lodge cards, green promises, adventures from the door and a booking-request flow that takes deposits offline once you confirm.",
    previewPath: "/template-previews/fernhollow",
    pageCount: 20,
    pages: hotelPages({ rooms: "Our lodges", wellness: "Hot tubs and wellbeing" }),
    highlights: [
      "Search bar floating over the hero",
      "Lodge cards with sleeps, bedrooms and size",
      "Dog-friendly and green-credential messaging",
      "Booking request with extras and a live summary",
      "Requests go to your inbox; no online payment",
      "Built to WCAG 2.2 AA, mobile-first",
    ],
    palette: ["#F4F6EE", "#DDE6CF", "#2E5E2A", "#1F3A1D"],
  },
  {
    slug: "aldwin",
    kind: "hotel",
    name: "The Aldwin",
    industry: "Boutique and city hotels",
    summary: "A calm, design-led website for boutique, townhouse and city hotels.",
    description:
      "Warm cream, near-black and a terracotta accent with classic serif type: room-type tiles, guest favourites, a brasserie teaser and the full booking journey, with guests paying at the hotel.",
    previewPath: "/template-previews/aldwin",
    pageCount: 20,
    pages: hotelPages({ rooms: "Rooms and suites", wellness: "Gym and wellbeing" }),
    highlights: [
      "Room-type tiles and guest favourites",
      "Neighbourhood guide and brasserie pages",
      "Availability with rate plans and stay totals",
      "Booking request with extras and a live summary",
      "Requests go to your inbox; no online payment",
      "Built to WCAG 2.2 AA, mobile-first",
    ],
    palette: ["#FFFFFF", "#F3ECE2", "#A4491F", "#1F1E1C"],
  },
];

export const WEBSITE_TEMPLATES: WebsiteTemplate[] = [...STOREFRONT_TEMPLATES, ...HOTEL_TEMPLATES];

export function getWebsiteTemplate(slug: string): WebsiteTemplate | undefined {
  return WEBSITE_TEMPLATES.find((t) => t.slug === slug);
}

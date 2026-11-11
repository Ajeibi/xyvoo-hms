import type { HmsExtraFeature, HmsExtraPage } from "@/constants/solutions-hms-extras";

const feature = (id: string, number: string, title: string, description: string): HmsExtraFeature => ({
  id,
  number,
  title,
  description,
  bullets: [],
  badge: "Live",
});

/** /white-labeling: rendered with the same HmsExtraLanding template as the
 * business-type pages, so it shares their design and section flow. */
export const WHITE_LABELING: HmsExtraPage = {
  id: "white-labeling",
  layout: "compact",
  watermark: "brand",
  eyebrow: "How white-labelling works",
  title: "Your platform. Your brand. Our technology, out of sight.",
  subtitle:
    "Every XYVOO platform is white-label. Your staff, guests and customers see your name, logo and colours. XYVOO is never visible to them.",
  heroLinks: [
    { id: "hms", title: "XYVOO HMS", description: "Hotels, fully under your brand.", href: "/solution/hms", label: "Explore" },
    { id: "storefront", title: "XYVOO Storefront", description: "Online stores, fully under your brand.", href: "/solution/storefront", label: "Explore" },
    { id: "support", title: "Branding questions", description: "Logos, colours, domains and what stays hidden.", href: "/support", label: "Ask" },
  ],
  glance: {
    stats: [
      { label: "Applies To", value: "HMS & Storefront" },
      { label: "Your Brand", value: "Logo, colour, name" },
      { label: "XYVOO Visible", value: "Never" },
    ],
    tagsLabel: "Branded",
  },
  features: [
    feature("dashboard", "01. Dashboard and staff screens", "Dashboard", "When your team signs in they see your hotel or store name, your logo and your brand colour. XYVOO operates in the background as the infrastructure."),
    feature("guest-pages", "02. Booking pages and storefront", "Guest pages", "Your booking website, storefront and checkout carry your identity from the first page a guest or customer opens."),
    feature("emails", "03. Emails and receipts", "Emails", "Confirmations, receipts, invoices and folios go out under your business name, not a generic template."),
    feature("app", "04. Installable app", "App", "Staff add the system to their phone's home screen without an app store. The installed app shows your business name and icon."),
    feature("colour", "05. Brand colour", "Colour", "Pick your primary brand colour once and the whole interface picks it up."),
    feature("address", "06. Your web address", "Address", "Your system runs on your own subdomain today. Custom domains, such as app.yourhotel.com, are in development and need no data migration when they arrive."),
  ],
  featureGroups: [
    {
      eyebrow: "What your team sees",
      title: "Your name on every screen.",
      intro: "Look closely at a real XYVOO dashboard: the business name is the hotel's, not ours.",
      featureIds: ["dashboard", "colour", "app"],
      image: {
        src: "/images/extras/HMS/Property Management Dashboard Mockup.png",
        alt: "A hotel dashboard showing the hotel's own name, Firefly, with no XYVOO logo",
        width: 1536,
        height: 1024,
        side: "left",
      },
    },
    {
      eyebrow: "What your guests see",
      title: "Your brand from booking to receipt.",
      intro: "Everything a guest or customer touches looks like it was built by you.",
      featureIds: ["guest-pages", "emails"],
      image: {
        src: "/images/extras/HMS/Reservation dashboard device mockup.png",
        alt: "A hotel reservations dashboard on a laptop and phone, showing the hotel's own name, Bookly",
        width: 1414,
        height: 1113,
        side: "right",
      },
    },
    {
      eyebrow: "Where it lives",
      title: "A web address that is yours.",
      intro: "Share one link and customers only ever meet your brand.",
      featureIds: ["address"],
      image: {
        src: "/images/extras/Storefront/Laptop and Smartphone Storefront Mockup.png",
        alt: "A store dashboard showing the store owner's own brand, Liz, and its web address settings",
        width: 1536,
        height: 1024,
        side: "left",
      },
    },
  ],
  growth: {
    eyebrow: "White-label, always",
    title: "What changes when you go white-label.",
    subtitle: "Your guests and customers see your brand. XYVOO never appears.",
    tagline: "One system underneath. Your brand on top.",
  },
  integrations: {
    title: "Where this shows up",
    intro: "Branding is not a skin on one page. It runs through everything your customers touch.",
    items: [],
  },
  onboarding: {
    heading: "",
    cards: [],
  },
};

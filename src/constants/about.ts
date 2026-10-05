export const ABOUT_HERO = {
  eyebrow: "About XYVOO",
  title: "One company. Two platforms.\nSoftware that runs your business.",
  subtitle:
    "XYVOO builds dedicated, white-label systems for hotels and online retailers, never one generic toolkit stretched to cover both. Your team runs on a single connected platform. Your guests and customers only ever see your brand.",
};

export type AboutBeliefPoint = {
  title: string;
  description: string;
};

export const ABOUT_WHO_WE_ARE = {
  eyebrow: "What We Believe",
  title: "Software should disappear into your business, not the other way round.",
  intro:
    "Most platforms sold to hotels and retailers are the same core system wearing two different skins. We built the opposite.",
};

export const ABOUT_WHO_POINTS: AboutBeliefPoint[] = [
  {
    title: "Two products, not one stretched thin",
    description:
      "XYVOO HMS and XYVOO Storefront are separate products, built and maintained independently, because a hotel and an online shop don't run the same operation.",
  },
  {
    title: "White-label, always",
    description:
      "Your guests and customers see your brand: on the booking page, the receipts, the app icon. XYVOO never appears.",
  },
  {
    title: "Built deep on what matters",
    description:
      "OTA sync with Booking.com and Expedia and digital key access for hotels; unlimited catalogues and zero platform fees for retailers.",
  },
  {
    title: "Live in minutes, not months",
    description:
      "Sign up and your property or store is live before an onboarding call would even have been booked elsewhere. Free for 14 days, no card required.",
  },
  {
    title: "Built to keep working",
    description:
      "Front desk and housekeeping keep running through a Wi-Fi drop and sync the moment you're back online.",
  },
  {
    title: "Same standards either way",
    description:
      "GDPR and NDPA-aligned data handling, a 99.9% uptime SLA, and a real support team behind every paid plan.",
  },
];

export const ABOUT_PLATFORMS_INTRO = {
  eyebrow: "What We Build",
  title: "Built deep, not wide.",
  subtitle:
    "We didn't start with a platform and go looking for markets to sell it into. We started with two problems (hotels running on spreadsheets and WhatsApp groups, retailers stitching together five different tools to sell online) and built a dedicated answer to each.",
};

export type AboutBuildTopCard = {
  id: string;
  title: string;
  description: string;
  linkLabel?: string;
  linkHref?: string;
};

export const ABOUT_BUILD_TOP_CARDS: AboutBuildTopCard[] = [
  {
    id: "hms",
    title: "Hotel Management, Your Brand",
    description:
      "PMS, reservations, housekeeping, F&B, billing, OTA sync and analytics: ten connected modules under one login. Staff never see XYVOO.",
    linkLabel: "Explore HMS",
    linkHref: "/solution/hms",
  },
  {
    id: "storefront",
    title: "E-Commerce, Your Brand",
    description:
      "Catalogue, checkout, payments and fulfilment under your storefront's identity, live in minutes, not months.",
    linkLabel: "Explore Storefront",
    linkHref: "/solution/storefront",
  },
  {
    id: "white-label",
    title: "White-Label, Always",
    description:
      "Your guests and customers see your brand: on the booking page, the receipts, the app icon. XYVOO never appears.",
  },
];

export type AboutBuildBottomCard = {
  title: string;
  description: string;
};

export const ABOUT_BUILD_BOTTOM_CARDS: AboutBuildBottomCard[] = [
  {
    title: "Live in 14 Days, Free",
    description:
      "Try either platform free for 14 days, no card required, before you commit to anything.",
  },
  {
    title: "99.9% Uptime, Real Support",
    description:
      "A 99.9% uptime SLA backed by priority support on every paid plan. Real people, real answers.",
  },
];

export const ABOUT_HOW_IT_WORKS = {
  title: "From sign-up to live, under your brand.",
  intro:
    "No matter which platform you're on, getting live follows the same three moves.",
  steps: [
    {
      title: "Choose your platform",
      description:
        "Running a hotel or a storefront? Pick XYVOO HMS or XYVOO Storefront, each built specifically for that business, not a generic toolkit stretched to fit.",
    },
    {
      title: "Set up in minutes",
      description:
        "Add your branding, your rooms or your catalogue, and your team. No lengthy onboarding calls, no implementation fees.",
    },
    {
      title: "Go live under your brand",
      description:
        "Your guests or customers only ever see your business. XYVOO stays invisible in the background.",
    },
  ],
};

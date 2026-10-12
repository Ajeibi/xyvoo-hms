import { z } from "zod";
import { storeSubdomainSchema } from "@/lib/store/subdomain";
import { SHOP_CURRENCIES } from "@/lib/store/currencies";
import { isCountryCode } from "@/lib/store/countries";
import { socialLinksSchema } from "@/lib/store/socials";
import { HEX_COLOUR_PATTERN } from "./contrast";
import { FONT_PAIRING_IDS } from "./fonts";
import { customFontSchema } from "./schema";
import { STORE_PLANS, type OnboardingStep } from "./onboarding";
import { STORE_CATEGORIES, STOREFRONT_TEMPLATE_SLUGS } from "./templates";

/**
 * What each onboarding wizard step submits. Shared by the wizard forms and
 * /api/store/onboarding, which validates with these before saving.
 */

/** Countries Paystack can settle to, with the currency a store there sells in. */
export const STORE_COUNTRIES = [
  { code: "NG", name: "Nigeria", currency: "NGN" },
  { code: "GH", name: "Ghana", currency: "GHS" },
  { code: "KE", name: "Kenya", currency: "KES" },
  { code: "ZA", name: "South Africa", currency: "ZAR" },
] as const;
export type StoreCountryCode = (typeof STORE_COUNTRIES)[number]["code"];

/** Currencies a shop can charge in: the ones Paystack settles to in the countries above, plus US dollars. */
export const PAYMENT_CURRENCIES = ["NGN", "GHS", "KES", "ZAR", "USD"] as const;
export type PaymentCurrency = (typeof PAYMENT_CURRENCIES)[number];

export function isPaymentCountry(code: string) {
  return STORE_COUNTRIES.some((c) => c.code === code);
}

/** A shop in a country we take payments in charges in its currency; anywhere else, in the one the merchant chose. */
export function homeCurrencyFor(countryCode: string, chosen: string | null | undefined): PaymentCurrency {
  const local = STORE_COUNTRIES.find((c) => c.code === countryCode)?.currency;
  if (local) return local;
  return (PAYMENT_CURRENCIES as readonly string[]).includes(chosen ?? "") ? (chosen as PaymentCurrency) : "NGN";
}

export function currencyForCountry(code: string) {
  return STORE_COUNTRIES.find((c) => c.code === code)?.currency ?? "NGN";
}

export const CATEGORY_LABELS: Record<(typeof STORE_CATEGORIES)[number], string> = {
  fashion: "Fashion and accessories",
  beauty: "Hair, beauty and skincare",
  home: "Home and furniture",
  food: "Food and drink",
  electronics: "Electronics and gadgets",
  health: "Health and wellness",
  kids: "Baby and kids",
  other: "Something else",
};

const phone = z
  .string()
  .trim()
  .max(30)
  .refine((v) => v.replace(/\D/g, "").length >= 7, "Enter a phone number customers can reach you on.");
const optionalPhone = z
  .string()
  .trim()
  .max(30)
  .refine((v) => v === "" || v.replace(/\D/g, "").length >= 7, "Enter a full phone number, or leave this blank.");
const money = z.coerce.number().min(0, "Amounts can't be negative.").max(100_000_000);

export const basicsSchema = z.object({
  storeName: z.string().trim().min(2, "Enter your store's name.").max(80, "Keep the name to 80 characters or fewer."),
  subdomain: storeSubdomainSchema,
  category: z.enum(STORE_CATEGORIES, { error: "Choose what you sell." }),
  /** What the merchant sells, in their words, when none of the categories fit. */
  categoryOther: z.string().trim().max(80, "Keep this to 80 characters or fewer.").default(""),
  countryCode: z.string().refine(isCountryCode, "Choose your country."),
  /** The currency to charge in when the country isn't one we take payments in. */
  currencyCode: z.enum(PAYMENT_CURRENCIES).default("NGN"),
  /** Other currencies to show prices in. Optional; priced fully in Payments later. */
  extraCurrencies: z.array(z.enum(SHOP_CURRENCIES)).max(SHOP_CURRENCIES.length).default([]),
}).superRefine((v, ctx) => {
  if (v.category === "other" && v.categoryOther.length < 2) {
    ctx.addIssue({ code: "custom", path: ["categoryOther"], message: "Tell us what you sell, for example hand-made candles." });
  }
});

export const templateSchema = z.object({
  templateSlug: z.enum(STOREFRONT_TEMPLATE_SLUGS, { error: "Choose a template." }),
});

export const brandSchema = z.object({
  logoUrl: z.string().trim().url().max(1000).nullable(),
  /** Null keeps the template's own colours. */
  accent: z.string().regex(HEX_COLOUR_PATTERN, "Choose a colour.").nullable(),
  fontPairing: z.enum(FONT_PAIRING_IDS),
  /** The merchant's own font, used instead of the pairing's heading font. Null uses the pairing. */
  customFont: customFontSchema.nullable().default(null),
  tagline: z.string().trim().max(140, "Keep the tagline to 140 characters or fewer."),
});

/** How customers reach the store; also edited later under Settings → Store details. */
export const contactFields = {
  businessEmail: z.string().trim().toLowerCase().email("Enter an email address customers can write to."),
  phone,
  whatsapp: optionalPhone,
  addressLine1: z.string().trim().min(3, "Enter your street address.").max(200),
  city: z.string().trim().min(2, "Search for your town or city, then choose it from the list.").max(100),
  state: z.string().trim().min(2, "Choose your state or region.").max(100),
  /** Links to the shop's social pages, any platform; see lib/store/socials. */
  socialLinks: socialLinksSchema,
};

export const essentialsSchema = z
  .object({
    ...contactFields,
    deliveryFee: money,
    freeDeliveryOver: money.nullable(),
    offersPickup: z.boolean(),
  })
  .refine((v) => v.freeDeliveryOver === null || v.freeDeliveryOver > 0, {
    path: ["freeDeliveryOver"],
    message: "Enter an amount above zero, or leave free delivery off.",
  });

export const planSchema = z.discriminatedUnion("plan", [
  z.object({ plan: z.literal("free") }),
  z.object({ plan: z.literal("standard") }),
  z.object({
    plan: z.literal("enterprise"),
    enquiry: z.object({
      name: z.string().trim().min(2, "Enter your name.").max(120),
      phone,
      message: z.string().trim().min(10, "Tell us a little about what you need.").max(2000),
    }),
  }),
]);

export const previewSchema = z.object({});

export const STEP_SCHEMAS = {
  basics: basicsSchema,
  template: templateSchema,
  brand: brandSchema,
  essentials: essentialsSchema,
  plan: planSchema,
  preview: previewSchema,
} satisfies Record<OnboardingStep, z.ZodType>;

export type StepValues<S extends OnboardingStep> = z.infer<(typeof STEP_SCHEMAS)[S]>;

export const STEP_TITLES: Record<OnboardingStep, string> = {
  basics: "Store basics",
  template: "Template",
  brand: "Brand",
  essentials: "Contact and delivery",
  plan: "Plan",
  preview: "Preview",
};

export const PLAN_CHOICES = STORE_PLANS;

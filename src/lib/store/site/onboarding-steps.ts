import { z } from "zod";
import { storeSubdomainSchema } from "@/lib/store/subdomain";
import { HEX_COLOUR_PATTERN } from "./contrast";
import { FONT_PAIRING_IDS } from "./fonts";
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
const COUNTRY_CODES = STORE_COUNTRIES.map((c) => c.code) as [StoreCountryCode, ...StoreCountryCode[]];

export function currencyForCountry(code: string) {
  return STORE_COUNTRIES.find((c) => c.code === code)?.currency ?? "NGN";
}

export const CATEGORY_LABELS: Record<(typeof STORE_CATEGORIES)[number], string> = {
  fashion: "Fashion and accessories",
  beauty: "Beauty and skincare",
  home: "Home and furniture",
  food: "Food and drink",
  electronics: "Electronics and gadgets",
  other: "Something else",
};

const httpsUrl = z
  .string()
  .trim()
  .max(300)
  .refine((v) => v === "" || /^https:\/\/[^\s]+$/.test(v), "Use a full link starting with https://");
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
  countryCode: z.enum(COUNTRY_CODES, { error: "Choose your country." }),
});

export const templateSchema = z.object({
  templateSlug: z.enum(STOREFRONT_TEMPLATE_SLUGS, { error: "Choose a template." }),
});

export const brandSchema = z.object({
  logoUrl: z.string().trim().url().max(1000).nullable(),
  /** Null keeps the template's own colours. */
  accent: z.string().regex(HEX_COLOUR_PATTERN, "Choose a colour.").nullable(),
  fontPairing: z.enum(FONT_PAIRING_IDS),
  tagline: z.string().trim().max(140, "Keep the tagline to 140 characters or fewer."),
});

/** How customers reach the store; also edited later under Settings → Store details. */
export const contactFields = {
  businessEmail: z.string().trim().toLowerCase().email("Enter an email address customers can write to."),
  phone,
  whatsapp: optionalPhone,
  addressLine1: z.string().trim().min(3, "Enter your street address.").max(200),
  city: z.string().trim().min(2, "Enter your town or city.").max(100),
  state: z.string().trim().min(2, "Enter your state or region.").max(100),
  instagram: httpsUrl,
  facebook: httpsUrl,
  tiktok: httpsUrl,
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

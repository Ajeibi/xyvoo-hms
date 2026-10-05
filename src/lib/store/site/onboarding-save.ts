import { createServerSupabaseClient } from "@/lib/supabase/server";
import { isReservedSubdomain } from "@/lib/store/subdomain";
import { contactRequestSchema, teamEmail } from "@/lib/marketing/contact-request";
import { sendContactRequestEmail } from "@/lib/mail/mailtrap";
import { getStoreSite, saveSiteDraft, setSiteTemplate } from "./data";
import { PLAN_FEE_RATES } from "./onboarding";
import { currencyForCountry, type StepValues } from "./onboarding-steps";
import { resolveSite } from "./resolve";
import { getStorefrontTemplate } from "./templates";

/**
 * Saves one onboarding wizard step. Values have already been validated with
 * the step's schema. Throws StepError with a message for the merchant when
 * something they entered can't be used.
 */

export class StepError extends Error {}

type Ctx = { tenantId: string; slug: string; userEmail: string | null };

const db = () => createServerSupabaseClient();

/** Returns the store's (possibly new) slug. */
export async function saveBasics(ctx: Ctx, v: StepValues<"basics">): Promise<string> {
  const service = db();
  let slug = ctx.slug;

  if (v.subdomain !== ctx.slug) {
    if (isReservedSubdomain(v.subdomain)) throw new StepError("That address is reserved. Please choose another.");
    const { data: taken } = await service
      .from("tenants")
      .select("id")
      .or(`subdomain.eq.${v.subdomain},name.eq.${v.subdomain}`)
      .neq("id", ctx.tenantId)
      .limit(1);
    if (taken?.length) throw new StepError("That web address is already taken. Please choose another.");
    slug = v.subdomain;
  }

  const { error: tenantError } = await service
    .from("tenants")
    .update({ display_name: v.storeName, subdomain: slug, name: slug })
    .eq("id", ctx.tenantId);
  if (tenantError) throw new Error(tenantError.message);

  const { error } = await service
    .schema("store")
    .from("business_profile")
    .update({ category: v.category, country_code: v.countryCode, currency_code: currencyForCountry(v.countryCode) })
    .eq("tenant_id", ctx.tenantId);
  if (error) throw new Error(error.message);
  return slug;
}

export async function saveTemplate(ctx: Ctx, v: StepValues<"template">) {
  await setSiteTemplate(ctx.tenantId, v.templateSlug);
}

export async function saveBrand(ctx: Ctx, v: StepValues<"brand">, storeName: string) {
  const site = await getStoreSite(ctx.tenantId);
  if (!site) throw new Error("This store has no site record.");

  const template = getStorefrontTemplate(site.templateSlug);
  const colours = { ...(site.draft.theme?.colours ?? {}) };
  delete colours.accent;
  delete colours.accentHover;
  if (v.accent) colours.accent = v.accent;
  const theme = { ...site.draft.theme, colours, fontPairing: v.fontPairing };

  // Refuse colours that would make the shop's buttons hard to read.
  const check = resolveSite(template.slug, { theme }, { storeName });
  if (check.contrastIssues.some((i) => i.label.startsWith("Button text"))) {
    throw new StepError("Button text wouldn't be readable on that colour. Please choose a darker or lighter shade.");
  }

  await saveSiteDraft(ctx.tenantId, {
    theme,
    brand: { ...site.draft.brand, logoUrl: v.logoUrl, logoAlt: storeName, tagline: v.tagline },
  });

  const { error } = await db().from("tenants").update({ logo_url: v.logoUrl }).eq("id", ctx.tenantId);
  if (error) throw new Error(error.message);
}

const DELIVERY_ZONE = "Standard delivery";
const PICKUP_ZONE = "Collect in person";

export async function saveEssentials(ctx: Ctx, v: StepValues<"essentials">) {
  const store = db().schema("store");
  const socials = Object.fromEntries(
    (["instagram", "facebook", "tiktok"] as const).filter((k) => v[k]).map((k) => [k, v[k]]),
  );

  const { error: profileError } = await store
    .from("business_profile")
    .update({
      business_email: v.businessEmail,
      phone: v.phone,
      whatsapp: v.whatsapp || null,
      address_line1: v.addressLine1,
      city: v.city,
      state: v.state,
      socials,
    })
    .eq("tenant_id", ctx.tenantId);
  if (profileError) throw new Error(profileError.message);

  // The wizard manages two simple zones by name; the dashboard's delivery screen can add more later.
  const { data: zones } = await store.from("delivery_zones").select("id, name").eq("tenant_id", ctx.tenantId).in("name", [DELIVERY_ZONE, PICKUP_ZONE]);
  const zoneId = (name: string) => zones?.find((z) => z.name === name)?.id as string | undefined;

  const delivery = { tenant_id: ctx.tenantId, name: DELIVERY_ZONE, fee: v.deliveryFee, free_over: v.freeDeliveryOver, is_pickup: false, sort_order: 0, is_active: true };
  const deliveryId = zoneId(DELIVERY_ZONE);
  const { error: deliveryError } = deliveryId
    ? await store.from("delivery_zones").update(delivery).eq("id", deliveryId)
    : await store.from("delivery_zones").insert(delivery);
  if (deliveryError) throw new Error(deliveryError.message);

  const pickupId = zoneId(PICKUP_ZONE);
  if (v.offersPickup && !pickupId) {
    const { error } = await store
      .from("delivery_zones")
      .insert({ tenant_id: ctx.tenantId, name: PICKUP_ZONE, fee: 0, is_pickup: true, sort_order: 1, is_active: true });
    if (error) throw new Error(error.message);
  } else if (pickupId) {
    const { error } = await store.from("delivery_zones").update({ is_active: v.offersPickup }).eq("id", pickupId);
    if (error) throw new Error(error.message);
  }
}

/**
 * Records the plan choice. Standard can't be charged until platform billing
 * exists (Phase 6), so it's held as pending payment and the store keeps the
 * Free fee meanwhile. Enterprise enquiries go to the sales inbox and the
 * store starts on Free until terms are agreed.
 */
export async function savePlan(ctx: Ctx, v: StepValues<"plan">, storeName: string) {
  const subscriptions = db().schema("store").from("subscriptions");

  if (v.plan === "free") {
    const { error } = await subscriptions.update({ plan: "free", status: "active", platform_fee_rate: PLAN_FEE_RATES.free }).eq("tenant_id", ctx.tenantId);
    if (error) throw new Error(error.message);
    return;
  }

  if (v.plan === "standard") {
    const { error } = await subscriptions.update({ plan: "standard", status: "pending_payment", platform_fee_rate: PLAN_FEE_RATES.free }).eq("tenant_id", ctx.tenantId);
    if (error) throw new Error(error.message);
    return;
  }

  const enquiry = { ...v.enquiry, submitted_at: new Date().toISOString() };
  const { error } = await subscriptions
    .update({ plan: "free", status: "active", platform_fee_rate: PLAN_FEE_RATES.free, enterprise_enquiry: enquiry })
    .eq("tenant_id", ctx.tenantId);
  if (error) throw new Error(error.message);

  if (!ctx.userEmail) return;
  const request = contactRequestSchema.parse({
    type: "sales",
    name: v.enquiry.name,
    email: ctx.userEmail,
    company: storeName,
    businessType: "Storefront: Enterprise plan enquiry",
    message: `${v.enquiry.message}\n\nPhone: ${v.enquiry.phone}\nStore address: ${ctx.slug}`,
  });
  const mail = teamEmail(request);
  try {
    await sendContactRequestEmail({ to: mail.to, cc: mail.cc, replyTo: ctx.userEmail, subject: mail.subject, text: mail.text, html: mail.html });
  } catch (err) {
    // The enquiry is saved on the subscription either way; the team can find it there.
    console.error("[onboarding] enterprise enquiry email failed", err);
  }
}

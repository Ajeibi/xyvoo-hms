import { z } from "zod";
import { badge, escapeHtml, quoteBlock } from "@/lib/mail/layout";
import { sendBrandedEmail } from "@/lib/mail/mailtrap";
import { formatShopCurrency } from "@/lib/shop/format";
import { rateLimitShared } from "@/lib/rate-limit";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { storeCurrency } from "./payout-routes";
import { STORE_PATHS } from "./site/links";
import { storefrontUrl } from "./subdomain";
import { dateLocale } from "./receipts-format";
import { layoutWords, savedLanguage, shopperEmailT } from "./order-emails";

/*
 * Gift cards (store.gift_cards). Selling them uses a "Gift card" product whose
 * options are the amounts the shop offers; buying one goes through checkout
 * like anything else. The database creates the card when that order is paid
 * and puts gift card money back if an order is cancelled (see the migration),
 * so this file only manages settings, checks codes and emails cards out.
 */

const store = () => createServerSupabaseClient().schema("store");

export const DEFAULT_GIFT_CARD_AMOUNTS = [5000, 10000, 20000, 50000];
export const AMOUNT_OPTION = "Amount";

export type GiftCardSettings = { enabled: boolean; productId: string | null; expiryMonths: number | null; amounts: number[]; currency: string };

export async function getGiftCardSettings(tenantId: string): Promise<GiftCardSettings> {
  const [{ data: profile }, currency] = await Promise.all([
    store().from("business_profile").select("gift_cards_enabled, gift_card_product_id, gift_card_expiry_months").eq("tenant_id", tenantId).maybeSingle(),
    storeCurrency(tenantId, createServerSupabaseClient()),
  ]);
  const productId = (profile?.gift_card_product_id as string | null) ?? null;
  let amounts: number[] = [];
  if (productId) {
    const { data: variants } = await store().from("product_variants").select("price_override").eq("product_id", productId).is("archived_at", null);
    amounts = (variants || []).map((v) => Number(v.price_override) || 0).filter((n) => n > 0).sort((a, b) => a - b);
  }
  return {
    enabled: Boolean(profile?.gift_cards_enabled),
    productId,
    expiryMonths: (profile?.gift_card_expiry_months as number | null) ?? null,
    amounts: amounts.length ? amounts : DEFAULT_GIFT_CARD_AMOUNTS,
    currency,
  };
}

export const giftCardSettingsSchema = z.object({
  enabled: z.boolean(),
  amounts: z
    .array(z.number().positive().max(10_000_000))
    .min(1, "Add at least one amount.")
    .max(8, "Up to 8 amounts.")
    .transform((list) => [...new Set(list.map((n) => Math.round(n * 100) / 100))].sort((a, b) => a - b)),
  expiryMonths: z.number().int().min(1).max(120).nullable(),
});

/**
 * Saves the settings and keeps the "Gift card" product in step: created the
 * first time, one option per amount, on sale only while selling is switched on.
 */
export async function saveGiftCardSettings(tenantId: string, input: z.infer<typeof giftCardSettingsSchema>) {
  const current = await getGiftCardSettings(tenantId);
  const label = (amount: number) => formatShopCurrency(amount, current.currency);
  let productId = current.productId;

  // The product may have been deleted from the Products page: make a new one.
  if (productId) {
    const { data } = await store().from("products").select("id").eq("id", productId).eq("tenant_id", tenantId).maybeSingle();
    if (!data) productId = null;
  }

  const productFields = {
    status: input.enabled ? "active" : "draft",
    product_options: [{ name: AMOUNT_OPTION, values: input.amounts.map(label) }],
    price: input.amounts[0],
  };
  if (!productId) {
    const { data, error } = await store()
      .from("products")
      .insert({
        tenant_id: tenantId,
        name: "Gift card",
        short_description: "The perfect present: they choose what they love.",
        description: "Send a gift card by email. They can spend it on anything in the shop, in one go or over several orders.",
        product_type: "digital",
        visibility: "visible",
        approval_status: "approved",
        allow_backorder: true,
        stock: 0,
        taxable: false,
        ...productFields,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    productId = data.id as string;
  } else {
    const { error } = await store().from("products").update(productFields).eq("id", productId).eq("tenant_id", tenantId);
    if (error) throw new Error(error.message);
  }

  // One option per amount; amounts no longer offered are archived (past orders still point at them).
  const { data: variants } = await store().from("product_variants").select("id, price_override, archived_at").eq("product_id", productId);
  const now = new Date().toISOString();
  for (const v of variants || []) {
    const amount = Number(v.price_override);
    const wanted = input.amounts.includes(amount);
    if (!wanted && !v.archived_at) await store().from("product_variants").update({ archived_at: now }).eq("id", v.id);
    if (wanted) await store().from("product_variants").update({ archived_at: null, options: { [AMOUNT_OPTION]: label(amount) }, stock: 0 }).eq("id", v.id);
  }
  const existing = new Set((variants || []).map((v) => Number(v.price_override)));
  const added = input.amounts.filter((a) => !existing.has(a));
  if (added.length) {
    const { error } = await store()
      .from("product_variants")
      .insert(added.map((amount) => ({ product_id: productId, options: { [AMOUNT_OPTION]: label(amount) }, price_override: amount, stock: 0 })));
    if (error) throw new Error(error.message);
  }

  const { error } = await store()
    .from("business_profile")
    .upsert(
      { tenant_id: tenantId, gift_cards_enabled: input.enabled, gift_card_product_id: productId, gift_card_expiry_months: input.expiryMonths },
      { onConflict: "tenant_id" },
    );
  if (error) throw new Error(error.message);
  return getGiftCardSettings(tenantId);
}

// ---------------------------------------------------------------------------
// Codes
// ---------------------------------------------------------------------------

/** "7kqm 2xhd-9pra4twe" -> "7KQM-2XHD-9PRA-4TWE", or null if it can't be a code. Mirrors store.normalise_gift_card_code. */
export function normaliseGiftCardCode(code: string) {
  const c = code.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return c.length === 16 ? `${c.slice(0, 4)}-${c.slice(4, 8)}-${c.slice(8, 12)}-${c.slice(12)}` : null;
}

export type GiftCardCheck =
  | { ok: true; code: string; balance: number; currency: string; expiresAt: string | null }
  | { ok: false; message: string };

export const GIFT_CARD_PROBLEMS: Record<string, string> = {
  not_found: "We can't find that gift card. Check the code and try again.",
  disabled: "That gift card can't be used any more. Please contact the shop.",
  expired: "That gift card has expired.",
  empty: "That gift card has no money left on it.",
};

/** What's left on a card, for checkout to show before the order is placed. */
export async function checkGiftCard(tenantId: string, code: string, now = new Date()): Promise<GiftCardCheck> {
  const normalised = normaliseGiftCardCode(code);
  if (!normalised) return { ok: false, message: "Gift card codes have 16 letters and numbers, like 7KQM-2XHD-9PRA-4TWE." };
  const { data } = await store().from("gift_cards").select("code, balance, currency, status, expires_at").eq("tenant_id", tenantId).eq("code", normalised).maybeSingle();
  if (!data) return { ok: false, message: GIFT_CARD_PROBLEMS.not_found };
  if (data.status !== "active") return { ok: false, message: GIFT_CARD_PROBLEMS.disabled };
  if (data.expires_at && new Date(data.expires_at) < now) return { ok: false, message: GIFT_CARD_PROBLEMS.expired };
  if (Number(data.balance) <= 0) return { ok: false, message: GIFT_CARD_PROBLEMS.empty };
  return { ok: true, code: normalised, balance: Number(data.balance), currency: data.currency as string, expiresAt: (data.expires_at as string | null) ?? null };
}

// ---------------------------------------------------------------------------
// Buying one: who it's for
// ---------------------------------------------------------------------------

export const giftCardPurchaseSchema = z.object({
  recipientName: z.string().trim().min(1, "Enter who the gift card is for.").max(120),
  recipientEmail: z.string().trim().toLowerCase().max(200).email("Enter the email address to send the gift card to."),
  senderName: z.string().trim().max(120).optional(),
  message: z.string().trim().max(300, "Keep the message under 300 characters.").optional(),
});

// ---------------------------------------------------------------------------
// Issued by the shop
// ---------------------------------------------------------------------------

export const issueGiftCardSchema = z.object({
  amount: z.number().positive("Enter an amount.").max(10_000_000),
  recipientName: z.string().trim().min(1, "Enter who it's for.").max(120),
  recipientEmail: z.string().trim().toLowerCase().max(200).email("Enter their email address."),
  message: z.string().trim().max(300).optional(),
});

export async function issueGiftCard(tenantId: string, input: z.infer<typeof issueGiftCardSchema>, createdBy: string | null) {
  const settings = await getGiftCardSettings(tenantId);
  const expires = settings.expiryMonths ? new Date(new Date().setMonth(new Date().getMonth() + settings.expiryMonths)).toISOString() : null;
  const { data, error } = await store().rpc("create_gift_card", {
    p_tenant_id: tenantId,
    p_amount: input.amount,
    p_currency: settings.currency,
    p_source: "issued",
    p_order_id: null,
    p_recipient_name: input.recipientName,
    p_recipient_email: input.recipientEmail,
    p_sender_name: null,
    p_message: input.message ?? null,
    p_expires_at: expires,
    p_created_by: createdBy,
  });
  if (error) throw new Error(error.message);
  await sendUnsentGiftCards(tenantId);
  return data as { id: string; code: string };
}

// ---------------------------------------------------------------------------
// Emailing cards to their recipients
// ---------------------------------------------------------------------------

type CardRow = {
  id: string;
  tenant_id: string;
  code: string;
  initial_amount: number;
  currency: string;
  source: "purchase" | "issued";
  recipient_name: string | null;
  recipient_email: string;
  sender_name: string | null;
  message: string | null;
  expires_at: string | null;
  emailed_at: string | null;
  /** The order that bought it (null for cards the shop issued). */
  order_id: string | null;
};

/** Emails every new card that hasn't gone out yet (one shop, or all). Returns how many were sent. */
export async function sendUnsentGiftCards(tenantId?: string, onlyCardId?: string): Promise<number> {
  let query = store()
    .from("gift_cards")
    .select("id, tenant_id, code, initial_amount, currency, source, recipient_name, recipient_email, sender_name, message, expires_at, emailed_at, order_id")
    .is("emailed_at", null)
    .not("recipient_email", "is", null)
    .eq("status", "active")
    .limit(100);
  if (tenantId) query = query.eq("tenant_id", tenantId);
  // A resend can be for an older card; the sweep only picks up cards from the last 30 days.
  query = onlyCardId ? query.eq("id", onlyCardId) : query.gt("created_at", new Date(Date.now() - 30 * 86_400_000).toISOString());
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  const cards = (data || []) as CardRow[];
  if (!cards.length) return 0;

  const tenantIds = [...new Set(cards.map((c) => c.tenant_id))];
  const [{ data: tenants }, { data: profiles }] = await Promise.all([
    createServerSupabaseClient().from("tenants").select("id, subdomain, name, display_name").in("id", tenantIds),
    store().from("business_profile").select("tenant_id, business_email").in("tenant_id", tenantIds),
  ]);
  const tenantFor = new Map((tenants || []).map((t) => [t.id as string, t]));
  const replyTo = new Map((profiles || []).map((p) => [p.tenant_id as string, (p.business_email as string | null) ?? null]));

  let sent = 0;
  for (const card of cards) {
    const tenant = tenantFor.get(card.tenant_id);
    if (!tenant) continue;
    const { data: claimed } = await store().from("gift_cards").update({ emailed_at: new Date().toISOString() }).eq("id", card.id).is("emailed_at", null).select("id");
    if (!claimed?.length) continue;
    try {
      await sendGiftCardEmail(card, tenant, replyTo.get(card.tenant_id) ?? null);
      sent += 1;
    } catch (err) {
      console.error("[gift cards] email not sent", err);
      await store().from("gift_cards").update({ emailed_at: null }).eq("id", card.id);
    }
  }
  return sent;
}

/** At most every ten minutes, whoever asks (alongside the other background jobs). */
export async function runGiftCardEmailsIfDue() {
  try {
    if (!(await rateLimitShared("job:gift-card-emails", 1, 10 * 60_000)).ok) return;
    await sendUnsentGiftCards();
  } catch (err) {
    console.error("[gift cards] run failed", err);
  }
}

/** Never throws: for after a payment is confirmed. */
export async function sendGiftCardsForShop(tenantId: string) {
  try {
    await sendUnsentGiftCards(tenantId);
  } catch (err) {
    console.error("[gift cards] send failed", err);
  }
}

async function sendGiftCardEmail(card: CardRow, tenant: { subdomain?: unknown; name?: unknown; display_name?: unknown }, shopEmail: string | null) {
  const slug = String(tenant.subdomain || tenant.name);
  const storeName = (tenant.display_name as string | null)?.trim() || slug;
  // A bought card goes out in the language its order was placed in; one the shop issued, in the shop's main language.
  const t = await shopperEmailT(card.tenant_id, card.order_id ? await savedLanguage("orders", card.tenant_id, card.order_id) : null);
  const amount = formatShopCurrency(Number(card.initial_amount), card.currency);
  const from = card.source === "purchase" ? card.sender_name || t("emails.giftSomeone") : storeName;
  const greeting = card.recipient_name ? t("emails.greetingName", { name: card.recipient_name.split(/\s+/)[0] }) : t("emails.greetingNone");
  const intro = t("emails.giftIntro", { greeting, from, amount, shop: storeName });
  const expiry = card.expires_at
    ? t("emails.giftUntil", { date: new Date(card.expires_at).toLocaleDateString(dateLocale(t.lang), { day: "numeric", month: "long", year: "numeric" }) })
    : t("emails.giftNoExpiry");
  const shopUrl = `${storefrontUrl(slug)}${STORE_PATHS.products}`;
  const box = t("checkout.giftCard");

  await sendBrandedEmail({
    to: card.recipient_email,
    subject: t("emails.giftSubject", { from, amount, shop: storeName }),
    replyTo: shopEmail,
    text: [
      intro,
      ...(card.message ? ["", t("emails.giftTheirMessage", { message: card.message })] : []),
      "",
      t("emails.giftYourCode", { code: card.code }),
      t("emails.giftAmountLine", { amount, expiry }),
      "",
      `${t("emails.giftHowTo", { box })} ${t("emails.startShopping")}: ${shopUrl}`,
      "",
      t("emails.giftKeepSafe"),
    ].join("\n"),
    layout: {
      ...layoutWords(t),
      preheader: t("emails.giftPreheader", { amount, shop: storeName }),
      badges: [badge(box, "green")],
      title: t("emails.giftTitle", { amount }),
      intro,
      body: `${card.message ? quoteBlock(card.source === "purchase" ? t("emails.giftMessageFrom", { from }) : t("emails.giftMessageFromShop"), card.message) : ""}
      <div style="margin:24px 0 8px;padding:24px;border-radius:16px;background:linear-gradient(135deg,#0b5cad,#7c3aed);color:#ffffff;text-align:center">
        <div style="font-size:13px;letter-spacing:0.12em;text-transform:uppercase;opacity:0.9">${escapeHtml(t("emails.giftCardOf", { shop: storeName }))}</div>
        <div style="margin:10px 0 14px;font-size:30px;font-weight:800">${escapeHtml(amount)}</div>
        <div style="display:inline-block;padding:10px 16px;border-radius:10px;background:#ffffff;color:#000d1f;font-size:20px;font-weight:800;letter-spacing:3px;font-family:'Courier New',monospace">${escapeHtml(card.code)}</div>
      </div>
      <p style="margin:12px 0 0;color:#475569;font-size:14px;line-height:1.6">${escapeHtml(expiry)} ${escapeHtml(t("emails.giftHowTo", { box: "{box}" })).replace("{box}", `<strong>${escapeHtml(box)}</strong>`)} ${escapeHtml(t("emails.giftKeepSafe"))}</p>`,
      buttons: [{ label: t("emails.startShopping"), href: shopUrl }],
      footerNote: card.source === "purchase" ? t("emails.giftFooterBought", { from, shop: storeName }) : t("emails.giftFooterIssued", { shop: storeName }),
    },
  });
}

// ---------------------------------------------------------------------------
// The shop's list
// ---------------------------------------------------------------------------

export type GiftCardRow = {
  id: string;
  code: string;
  initialAmount: number;
  balance: number;
  currency: string;
  status: "active" | "disabled";
  source: "purchase" | "issued";
  recipientName: string | null;
  recipientEmail: string | null;
  senderName: string | null;
  expiresAt: string | null;
  emailedAt: string | null;
  createdAt: string;
};

export async function listGiftCards(tenantId: string): Promise<GiftCardRow[]> {
  const { data, error } = await store()
    .from("gift_cards")
    .select("id, code, initial_amount, balance, currency, status, source, recipient_name, recipient_email, sender_name, expires_at, emailed_at, created_at")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) throw new Error(error.message);
  return (data || []).map((c) => ({
    id: c.id as string,
    code: c.code as string,
    initialAmount: Number(c.initial_amount),
    balance: Number(c.balance),
    currency: c.currency as string,
    status: c.status as GiftCardRow["status"],
    source: c.source as GiftCardRow["source"],
    recipientName: (c.recipient_name as string | null) ?? null,
    recipientEmail: (c.recipient_email as string | null) ?? null,
    senderName: (c.sender_name as string | null) ?? null,
    expiresAt: (c.expires_at as string | null) ?? null,
    emailedAt: (c.emailed_at as string | null) ?? null,
    createdAt: c.created_at as string,
  }));
}

export async function setGiftCardStatus(tenantId: string, id: string, status: "active" | "disabled") {
  const { error } = await store().from("gift_cards").update({ status }).eq("tenant_id", tenantId).eq("id", id);
  if (error) throw new Error(error.message);
}

/** Resends a card's email (e.g. the recipient lost it). */
export async function resendGiftCard(tenantId: string, id: string) {
  await store().from("gift_cards").update({ emailed_at: null }).eq("tenant_id", tenantId).eq("id", id);
  return (await sendUnsentGiftCards(tenantId, id)) > 0;
}

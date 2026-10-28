import { after } from "next/server";
import { badge, detailsPanel } from "@/lib/mail/layout";
import { sendBrandedEmail } from "@/lib/mail/mailtrap";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { CustomerAccount, CustomerSession } from "./customer-accounts";
import { storefrontUrl } from "./subdomain";
import { layoutWords, savedLanguage, shopperEmailT } from "./order-emails";
import { nextTradeStatus, wholesaleSettings, type TradeAction, type TradeStatus, type WholesaleSettings } from "./wholesale";

const db = () => createServerSupabaseClient().schema("store");
const missing = (error: { code?: string } | null) => Boolean(error && ["42P01", "42703", "PGRST205", "PGRST204"].includes(error.code ?? ""));

export class TradeError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export async function getWholesaleSettings(tenantId: string): Promise<WholesaleSettings> {
  const { data, error } = await db().from("business_profile").select("wholesale").eq("tenant_id", tenantId).maybeSingle();
  if (error && !missing(error)) throw new Error(error.message);
  return wholesaleSettings(data?.wholesale);
}

export async function saveWholesaleSettings(tenantId: string, settings: WholesaleSettings) {
  const { error } = await db().from("business_profile").upsert({ tenant_id: tenantId, wholesale: settings }, { onConflict: "tenant_id" });
  if (error) throw new Error(error.message);
}

export type TradeInfo = { status: TradeStatus; business: string | null; message: string | null };

/** Where an account stands. Read apart from the main account so shoppers still sign in before wholesale is set up. */
export async function tradeInfo(accountId: string): Promise<TradeInfo> {
  const { data, error } = await db().from("customer_accounts").select("trade_status, trade_business, trade_message").eq("id", accountId).maybeSingle();
  if (error) {
    if (missing(error)) return { status: "none", business: null, message: null };
    throw new Error(error.message);
  }
  return { status: ((data?.trade_status as TradeStatus | undefined) ?? "none"), business: (data?.trade_business as string | null) ?? null, message: (data?.trade_message as string | null) ?? null };
}

/**
 * The shop's wholesale settings when this shopper gets trade prices (wholesale
 * is on, they have an approved trade account, and they have confirmed their
 * email with a code); otherwise null.
 */
export async function activeTrade(tenantId: string, session: CustomerSession | null): Promise<WholesaleSettings | null> {
  if (!session?.verified) return null;
  const settings = await getWholesaleSettings(tenantId).catch(() => null);
  if (!settings?.enabled) return null;
  const info = await tradeInfo(session.account.id).catch(() => null);
  return info?.status === "approved" ? settings : null;
}

export type TradePricing = { productPrice: number; wholesalePrice: number | null; minQty: number };

/** Each product's retail price, trade price and trade minimum, by product id. */
export async function tradePricing(tenantId: string, productIds: string[]): Promise<Map<string, TradePricing>> {
  const ids = [...new Set(productIds)];
  if (!ids.length) return new Map();
  const { data, error } = await db().from("products").select("id, price, wholesale_price, wholesale_min_qty").eq("tenant_id", tenantId).in("id", ids);
  if (error) {
    if (missing(error)) return new Map();
    throw new Error(error.message);
  }
  return new Map((data || []).map((p) => [p.id as string, { productPrice: Number(p.price) || 0, wholesalePrice: p.wholesale_price != null ? Number(p.wholesale_price) : null, minQty: Number(p.wholesale_min_qty) || 1 }]));
}

type Shop = { slug: string; storeName: string; shopEmail: string | null };

async function getShop(tenantId: string): Promise<Shop> {
  const [{ data: tenant }, { data: profile }] = await Promise.all([
    createServerSupabaseClient().from("tenants").select("subdomain, name, display_name").eq("id", tenantId).maybeSingle(),
    db().from("business_profile").select("business_email").eq("tenant_id", tenantId).maybeSingle(),
  ]);
  const slug = String(tenant?.subdomain || tenant?.name || "");
  return { slug, storeName: (tenant?.display_name as string | null)?.trim() || slug, shopEmail: (profile?.business_email as string | null) ?? null };
}

/** A confirmed customer asks for a trade account. */
export async function applyForTrade(tenantId: string, account: CustomerAccount, input: { business: string; about?: string }) {
  const settings = await getWholesaleSettings(tenantId);
  if (!settings.enabled) throw new TradeError("OFF", "This shop isn't taking trade applications right now.");
  const current = await tradeInfo(account.id);
  if (current.status === "pending") throw new TradeError("CONFLICT", "Your application is already with the shop.");
  if (current.status === "approved") throw new TradeError("CONFLICT", "You already have a trade account.");

  const now = new Date().toISOString();
  const { error } = await db()
    .from("customer_accounts")
    .update({ trade_status: "pending", trade_business: input.business, trade_about: input.about?.trim() || null, trade_message: null, trade_applied_at: now, trade_decided_at: null })
    .eq("id", account.id)
    .eq("tenant_id", tenantId);
  if (error) throw new Error(error.message);

  // Told in the background, so the customer isn't kept waiting for the email.
  after(async () => {
    try {
    const shop = await getShop(tenantId);
    if (shop.shopEmail) {
      await sendBrandedEmail({
        to: shop.shopEmail,
        subject: `Trade account application from ${input.business}`,
        text: [`${account.name || account.email} (${account.email}) has applied for a trade account.`, `Business: ${input.business}`, input.about ? `About them: ${input.about}` : "", "", "Open Trade accounts in your dashboard to approve or decline."].filter(Boolean).join("\n"),
        layout: {
          preheader: `${input.business} would like a trade account.`,
          badges: [badge("Trade application", "amber")],
          title: `Trade account application`,
          intro: `${account.name || account.email} would like trade prices.`,
          body: detailsPanel([{ label: "Business", value: input.business }, { label: "Email", value: account.email }, ...(input.about ? [{ label: "About them", value: input.about }] : [])]),
          buttons: [{ label: "Open Trade accounts", href: `${process.env.NEXT_PUBLIC_APP_URL || ""}/storefront/${shop.slug}/trade` }],
          footerNote: `You're receiving this because someone applied for a trade account at ${shop.storeName}.`,
        },
      });
    }
    } catch (err) {
      console.error("[wholesale] shop not told", err);
    }
  });
}

export type TradeAccountRow = { accountId: string; name: string | null; email: string; phone: string | null; business: string | null; about: string | null; status: TradeStatus; message: string | null; appliedAt: string | null };

export async function listTradeAccounts(tenantId: string): Promise<TradeAccountRow[]> {
  const { data, error } = await db()
    .from("customer_accounts")
    .select("id, name, email, phone, trade_status, trade_business, trade_about, trade_message, trade_applied_at")
    .eq("tenant_id", tenantId)
    .neq("trade_status", "none")
    .order("trade_applied_at", { ascending: false })
    .limit(500);
  if (error) {
    if (missing(error)) return [];
    throw new Error(error.message);
  }
  return (data || []).map((r) => ({
    accountId: r.id as string,
    name: (r.name as string | null) ?? null,
    email: r.email as string,
    phone: (r.phone as string | null) ?? null,
    business: (r.trade_business as string | null) ?? null,
    about: (r.trade_about as string | null) ?? null,
    status: r.trade_status as TradeStatus,
    message: (r.trade_message as string | null) ?? null,
    appliedAt: (r.trade_applied_at as string | null) ?? null,
  }));
}

/** Approves, declines or takes away a trade account, and emails the customer. */
export async function decideTrade(tenantId: string, accountId: string, action: TradeAction, message: string | undefined) {
  const { data: row } = await db().from("customer_accounts").select("id, name, email, trade_status, trade_business").eq("tenant_id", tenantId).eq("id", accountId).maybeSingle();
  if (!row) throw new TradeError("NOT_FOUND", "That account can't be found.");
  const current = row.trade_status as TradeStatus;
  const next = nextTradeStatus(current, action);
  if (!next) throw new TradeError("CONFLICT", "That can't be done at this stage. Please refresh the page.");
  const { data: updated, error } = await db()
    .from("customer_accounts")
    .update({ trade_status: next, trade_message: message?.trim() || null, trade_decided_at: new Date().toISOString() })
    .eq("tenant_id", tenantId)
    .eq("id", accountId)
    .eq("trade_status", current)
    .select("id")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!updated) throw new TradeError("CONFLICT", "Someone else just changed this account. Please refresh the page.");

  after(async () => {
    try {
    const shop = await getShop(tenantId);
    // In the language saved with the shopper's account.
    const t = await shopperEmailT(tenantId, await savedLanguage("customer_accounts", tenantId, accountId));
    const approved = next === "approved";
    const title = approved ? t("emails.tradeReadyTitle") : action === "revoke" ? t("emails.tradeEndedTitle") : t("emails.tradeDeclinedTitle");
    const intro = approved ? t("emails.tradeApprovedIntro", { shop: shop.storeName }) : t("emails.tradeDeclinedIntro", { shop: shop.storeName });
    const fromShop = t("emails.labelMessageFromShop");
    await sendBrandedEmail({
      to: row.email as string,
      subject: t("emails.tradeSubject", { title, shop: shop.storeName }),
      replyTo: shop.shopEmail,
      text: [intro, message ? `\n${fromShop}: ${message}` : "", `\n${storefrontUrl(shop.slug)}/account`].filter(Boolean).join("\n"),
      layout: {
        ...layoutWords(t),
        preheader: title,
        badges: [badge(approved ? t("emails.badgeTradeAccount") : t("emails.badgeTradeUpdate"), approved ? "green" : "amber")],
        title,
        intro,
        body: message ? detailsPanel([{ label: fromShop, value: message }]) : undefined,
        buttons: [{ label: approved ? t("emails.tradeSignIn") : t("emails.goToAccount"), href: `${storefrontUrl(shop.slug)}/account` }],
        footerNote: t("emails.tradeFooter", { shop: shop.storeName }),
      },
    });
    } catch (err) {
      console.error("[wholesale] customer not emailed", err);
    }
  });
  return next;
}

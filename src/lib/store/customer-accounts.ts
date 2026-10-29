import crypto from "node:crypto";
import { cookies } from "next/headers";
import { z } from "zod";
import { checkCode, CODE_TTL_MINUTES, RESEND_COOLDOWN_SECONDS, type CodeCheck } from "@/lib/auth/account-codes";
import { badge, escapeHtml } from "@/lib/mail/layout";
import { sendBrandedEmail } from "@/lib/mail/mailtrap";
import type { ShopTenant } from "@/lib/shop/tenants";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { storefrontUrl } from "./subdomain";
import { emailLanguage, emailT } from "./i18n/shopper";
import type { Translator } from "./i18n/translate";

/*
 * Shopper accounts, one set per shop (store.customer_accounts). No passwords:
 * signing in is a 6-digit code emailed to the shopper. A device that creates an
 * account is signed in straight away ("unconfirmed"); order history only shows
 * on a device confirmed with a code, so typing someone else's email address
 * never reveals their orders.
 */

export const SESSION_DAYS = 180;

const store = () => createServerSupabaseClient().schema("store");
const sha256 = (value: string) => crypto.createHash("sha256").update(value).digest("hex");

/** One cookie per shop, named by the shop's id so it survives an address change. */
export const customerCookieName = (tenantId: string) => `sf_acct_${tenantId.replace(/-/g, "").slice(0, 16)}`;

/** The account form's check messages. English by default; `accountFormWords(t)` gives them in the shopper's language. */
export type AccountFormWords = { name: string; email: string; phone: string };
const ENGLISH_FORM_WORDS: AccountFormWords = {
  name: "Enter your name.",
  email: "Enter an email address in the format name@example.com.",
  phone: "Enter a phone number using digits only.",
};
export const accountFormWords = (t: Translator): AccountFormWords => ({ name: t("account.enterName"), email: t("account.enterEmail"), phone: t("emails.phoneDigits") });

const phoneSchemaWith = (words: AccountFormWords) =>
  z
    .string()
    .trim()
    .max(40)
    .regex(/^[0-9+()\s-]*$/, words.phone)
    .optional()
    .transform((v) => (v ? v : undefined));

/** The same rules as accountDetailsSchema, with its messages in the shopper's language: accountDetailsSchemaWith(accountFormWords(t)). */
export const accountDetailsSchemaWith = (words: AccountFormWords = ENGLISH_FORM_WORDS) =>
  z.object({
    name: z.string().trim().min(1, words.name).max(120),
    email: z.string().trim().toLowerCase().max(200).email(words.email),
    phone: phoneSchemaWith(words),
    consent: z.boolean().default(false),
  });
export const accountDetailsSchema = accountDetailsSchemaWith();
export type AccountDetails = z.infer<typeof accountDetailsSchema>;

export type CustomerAccount = {
  id: string;
  email: string;
  name: string | null;
  phone: string | null;
  contactConsent: boolean;
  emailVerified: boolean;
};

export type CustomerSession = { sessionId: string; verified: boolean; account: CustomerAccount };

type AccountRow = { id: string; email: string; name: string | null; phone: string | null; contact_consent: boolean; email_verified_at: string | null };
const ACCOUNT_COLUMNS = "id, email, name, phone, contact_consent, email_verified_at";
const toAccount = (r: AccountRow): CustomerAccount => ({
  id: r.id,
  email: r.email,
  name: r.name,
  phone: r.phone,
  contactConsent: r.contact_consent,
  emailVerified: Boolean(r.email_verified_at),
});

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

/** The signed-in shopper on this request, if any. */
export async function getCustomerSession(tenantId: string): Promise<CustomerSession | null> {
  const token = (await cookies()).get(customerCookieName(tenantId))?.value;
  if (!token || token.length < 32 || token.length > 128) return null;
  const { data } = await store()
    .from("customer_sessions")
    .select(`id, verified, expires_at, last_seen_at, account:account_id(${ACCOUNT_COLUMNS})`)
    .eq("tenant_id", tenantId)
    .eq("token_hash", sha256(token))
    .maybeSingle();
  const account = data?.account as unknown as AccountRow | null;
  if (!data || !account || new Date(data.expires_at).getTime() < Date.now()) return null;

  // Note the visit, at most once an hour.
  if (Date.now() - new Date(data.last_seen_at).getTime() > 3_600_000) {
    const now = new Date().toISOString();
    await Promise.all([
      store().from("customer_sessions").update({ last_seen_at: now }).eq("id", data.id),
      store().from("customer_accounts").update({ last_seen_at: now }).eq("id", account.id),
    ]);
  }
  return { sessionId: data.id, verified: data.verified, account: toAccount(account) };
}

/** Starts a session and returns the cookie to set on the response. */
export async function startCustomerSession(tenantId: string, accountId: string, verified: boolean) {
  const token = crypto.randomBytes(32).toString("base64url");
  const expires = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  const { error } = await store()
    .from("customer_sessions")
    .insert({ tenant_id: tenantId, account_id: accountId, token_hash: sha256(token), verified, expires_at: expires.toISOString() });
  if (error) throw new Error(error.message);
  return {
    name: customerCookieName(tenantId),
    value: token,
    options: { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, path: "/", expires },
  };
}

export async function endCustomerSession(tenantId: string, sessionId: string) {
  await store().from("customer_sessions").delete().eq("tenant_id", tenantId).eq("id", sessionId);
}

// ---------------------------------------------------------------------------
// Accounts
// ---------------------------------------------------------------------------

export async function findAccountByEmail(tenantId: string, email: string): Promise<CustomerAccount | null> {
  const { data } = await store().from("customer_accounts").select(ACCOUNT_COLUMNS).eq("tenant_id", tenantId).eq("email", email.trim().toLowerCase()).maybeSingle();
  return data ? toAccount(data as AccountRow) : null;
}

/** Creates an account, or returns null when the email already has one at this shop. */
export async function createAccount(tenantId: string, details: AccountDetails, source: "prompt" | "account_page" | "checkout"): Promise<CustomerAccount | null> {
  const now = new Date().toISOString();
  const { data, error } = await store()
    .from("customer_accounts")
    .insert({
      tenant_id: tenantId,
      email: details.email,
      name: details.name,
      phone: details.phone ?? null,
      contact_consent: details.consent,
      contact_consent_at: details.consent ? now : null,
      source,
    })
    .select(ACCOUNT_COLUMNS)
    .single();
  if (error?.code === "23505") return null;
  if (error) throw new Error(error.message);
  return toAccount(data as AccountRow);
}

/** The same rules as accountUpdateSchema, with its messages in the shopper's language: accountUpdateSchemaWith(accountFormWords(t)). */
export const accountUpdateSchemaWith = (words: AccountFormWords = ENGLISH_FORM_WORDS) =>
  z.object({
    name: z.string().trim().min(1, words.name).max(120).optional(),
    // "" clears the number, so it's checked before the phone rules (which would drop it).
    phone: z.union([z.literal(""), phoneSchemaWith(words)]),
    consent: z.boolean().optional(),
  });
export const accountUpdateSchema = accountUpdateSchemaWith();

export async function updateAccount(tenantId: string, accountId: string, update: z.infer<typeof accountUpdateSchema>) {
  const patch: Record<string, unknown> = {};
  if (update.name !== undefined) patch.name = update.name;
  if (update.phone !== undefined) patch.phone = update.phone || null;
  if (update.consent !== undefined) {
    patch.contact_consent = update.consent;
    patch.contact_consent_at = update.consent ? new Date().toISOString() : null;
  }
  if (!Object.keys(patch).length) return;
  const { error } = await store().from("customer_accounts").update(patch).eq("tenant_id", tenantId).eq("id", accountId);
  if (error) throw new Error(error.message);
}

/**
 * At checkout: the account for the shopper's email, made from their checkout
 * details if they don't have one yet. Existing details are only filled in where
 * they're missing; consent is never changed here.
 */
export async function accountForCheckout(tenantId: string, customer: { name?: string | null; email?: string | null; phone?: string | null }) {
  const email = customer.email?.trim().toLowerCase();
  if (!email || !z.string().email().safeParse(email).success) return null;
  const existing = await findAccountByEmail(tenantId, email);
  if (existing) {
    const fill: Record<string, string> = {};
    if (!existing.name && customer.name) fill.name = customer.name.slice(0, 120);
    if (!existing.phone && customer.phone) fill.phone = customer.phone.slice(0, 40);
    if (Object.keys(fill).length) await store().from("customer_accounts").update(fill).eq("id", existing.id);
    return { account: existing, created: false };
  }
  const created = await createAccount(
    tenantId,
    { name: (customer.name || "").slice(0, 120) || email, email, phone: customer.phone?.slice(0, 40) || undefined, consent: false },
    "checkout",
  );
  // Created at the same moment by another request: use that one.
  const account = created ?? (await findAccountByEmail(tenantId, email));
  return account ? { account, created: Boolean(created) } : null;
}

// ---------------------------------------------------------------------------
// Sign-in codes
// ---------------------------------------------------------------------------

const hashCode = (accountId: string, code: string) => sha256(`customer:${accountId}:${code}`);

/** A new code for this account (cancelling any earlier one), or null if one was sent under a minute ago. */
export async function issueSignInCode(tenantId: string, accountId: string): Promise<string | null> {
  const { data: latest } = await store()
    .from("customer_codes")
    .select("created_at")
    .eq("account_id", accountId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (latest && Date.now() - new Date(latest.created_at).getTime() < RESEND_COOLDOWN_SECONDS * 1000) return null;

  const now = new Date();
  await store().from("customer_codes").update({ consumed_at: now.toISOString() }).eq("account_id", accountId).is("consumed_at", null);
  const code = String(crypto.randomInt(100000, 1000000));
  const { error } = await store()
    .from("customer_codes")
    .insert({ tenant_id: tenantId, account_id: accountId, code_hash: hashCode(accountId, code), expires_at: new Date(now.getTime() + CODE_TTL_MINUTES * 60_000).toISOString() });
  if (error) throw new Error(error.message);
  return code;
}

/** Checks a code, counting the attempt; a match confirms the account's email. */
export async function redeemSignInCode(accountId: string, code: string): Promise<CodeCheck> {
  const { data: stored } = await store()
    .from("customer_codes")
    .select("id, code_hash, expires_at, attempts, consumed_at")
    .eq("account_id", accountId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const result = checkCode(stored, hashCode(accountId, code.trim()));
  if (!stored) return result;
  if (result === "ok") {
    const now = new Date().toISOString();
    await Promise.all([
      store().from("customer_codes").update({ consumed_at: now }).eq("id", stored.id),
      store().from("customer_accounts").update({ email_verified_at: now }).eq("id", accountId).is("email_verified_at", null),
    ]);
  } else if (result === "wrong") {
    await store().from("customer_codes").update({ attempts: stored.attempts + 1 }).eq("id", stored.id);
  }
  return result;
}

export const shopName = (tenant: Pick<ShopTenant, "displayName" | "subdomain" | "name">) => tenant.displayName?.trim() || String(tenant.subdomain || tenant.name);

/** The language saved with the account (the code route saves the one they're using just before sending). Null before the migration. */
async function accountLanguage(tenantId: string, accountId: string): Promise<unknown> {
  try {
    const { data, error } = await store().from("customer_accounts").select("language").eq("tenant_id", tenantId).eq("id", accountId).maybeSingle();
    return error ? null : ((data as { language?: unknown } | null)?.language ?? null);
  } catch {
    return null;
  }
}

export async function sendSignInCodeEmail(tenant: ShopTenant, account: CustomerAccount, code: string) {
  const storeName = shopName(tenant);
  const t = emailT(await emailLanguage(tenant.id, await accountLanguage(tenant.id, account.id)));
  const greeting = account.name ? t("emails.greetingName", { name: account.name.split(/\s+/)[0] }) : t("emails.greetingNone");
  const intro = t("emails.codeIntro", { greeting, shop: storeName });
  const codeIs = t("emails.codeIs", { code, minutes: CODE_TTL_MINUTES });
  await sendBrandedEmail({
    to: account.email,
    subject: t("emails.codeSubject", { shop: storeName, code }),
    text: `${intro}\n\n${codeIs}\n\n${t("emails.codeIgnore")}`,
    layout: {
      lang: t.lang,
      helpCentre: t("emails.helpCentre"),
      preheader: codeIs,
      badges: [badge(t("emails.badgeSignInCode"))],
      title: t("emails.codeTitle", { shop: storeName }),
      intro,
      body: `<div style="margin:0 0 20px;padding:24px;border:1px dashed #007edf;border-radius:12px;background:#f5faff;text-align:center">
        <div style="font-size:34px;font-weight:800;letter-spacing:10px;color:#000d1f;font-family:'Courier New',monospace">${escapeHtml(code)}</div>
        <div style="margin-top:8px;font-size:13px;color:#64748b">${escapeHtml(t("emails.codeExpires", { minutes: CODE_TTL_MINUTES }))}</div>
      </div>
      <p style="margin:0;color:#64748b;font-size:14px;line-height:1.6">${escapeHtml(`${t("emails.codeIgnore")} ${t("emails.codeNobody")}`)}</p>`,
      buttons: [{ label: t("emails.visitShop", { shop: storeName }), href: storefrontUrl(String(tenant.subdomain || tenant.name)), variant: "secondary" }],
      footerNote: t("emails.codeFooter", { shop: storeName }),
    },
  });
}

// ---------------------------------------------------------------------------
// What signed-in shoppers do
// ---------------------------------------------------------------------------

export async function recordProductView(tenantId: string, accountId: string, productId: string) {
  await store().rpc("record_customer_product_view", { p_tenant: tenantId, p_account: accountId, p_product: productId });
}

export const accountBasketSchema = z
  .array(
    z.object({
      productId: z.string().uuid(),
      variantId: z.string().uuid().nullable().optional(),
      name: z.string().trim().max(200),
      quantity: z.number().int().min(1).max(1000),
      unitPrice: z.number().min(0).max(100_000_000),
    }),
  )
  .max(50);

export async function saveAccountBasket(tenantId: string, accountId: string, basket: z.infer<typeof accountBasketSchema>) {
  await store()
    .from("customer_accounts")
    .update({ basket, basket_updated_at: new Date().toISOString() })
    .eq("tenant_id", tenantId)
    .eq("id", accountId);
}

/** A confirmed shopper's orders: those placed with the account, or with its email address. */
export async function accountOrders(tenantId: string, account: CustomerAccount) {
  const escaped = account.email.replace(/[%_\\]/g, (c) => `\\${c}`);
  const { data, error } = await store()
    .from("orders")
    .select("id, created_at, status, payment_status, total_amount, currency, order_items(product_name, quantity)")
    .eq("tenant_id", tenantId)
    .or(`customer_account_id.eq.${account.id},customer_email.ilike.${escaped}`)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw new Error(error.message);
  return (data || []).map((o) => ({
    id: o.id as string,
    reference: String(o.id).slice(0, 8).toUpperCase(),
    createdAt: o.created_at as string,
    status: o.status as string,
    paymentStatus: o.payment_status as string,
    total: Number(o.total_amount) || 0,
    currency: (o.currency as string | null) ?? null,
    items: ((o.order_items as { product_name: string; quantity: number }[]) || []).map((i) => `${i.quantity} × ${i.product_name}`),
  }));
}

/** The address from the shopper's latest order, to fill in checkout (confirmed devices only). */
export async function lastShippingAddress(tenantId: string, account: CustomerAccount) {
  const { data } = await store()
    .from("orders")
    .select("shipping_address")
    .eq("tenant_id", tenantId)
    .eq("customer_account_id", account.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const a = data?.shipping_address as { line1?: string; line2?: string; city?: string; state?: string } | null;
  return a?.line1 ? { line1: a.line1, line2: a.line2 ?? "", city: a.city ?? "", state: a.state ?? "" } : null;
}

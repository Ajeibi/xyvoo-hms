import { badge, detailsPanel, escapeHtml } from "@/lib/mail/layout";
import { sendBrandedEmail } from "@/lib/mail/mailtrap";
import { fixedLinePrices, type CartLine } from "@/lib/shop/cart";
import { formatShopCurrency } from "@/lib/shop/format";
import { getShopProductsByIds } from "@/lib/shop/products";
import { rateLimitShared } from "@/lib/rate-limit";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { priceBasketLines } from "./discounts-server";
import { sendLinkedPush } from "./push-links";
import { isSale } from "./sales";
import { isShopLive } from "./site/data";
import { storefrontUrl } from "./subdomain";

/*
 * Automatic abandoned-cart reminders. A shopper who left their email at
 * checkout and didn't pay gets a reminder an hour after they stopped, and (if
 * the shop sends two) another the next day. The email's button puts their
 * basket back in the shop. Nothing is sent once they've bought, once the shop
 * has followed them up by hand, or if they've asked not to be reminded.
 */

/** Reminders a shop can send per basket: 0 (off), 1 or 2. */
export type CartReminderSetting = 0 | 1 | 2;
export const DEFAULT_CART_REMINDERS: CartReminderSetting = 2;

export const FIRST_REMINDER_AFTER_MINUTES = 60;
export const SECOND_REMINDER_AFTER_HOURS = 24;
/** Baskets older than this are never reminded, e.g. when a shop first turns reminders on. */
export const REMINDER_MAX_AGE_HOURS = 72;

export const cartReminderSetting = (value: unknown): CartReminderSetting => {
  const n = Number(value);
  return n === 0 || n === 1 || n === 2 ? n : DEFAULT_CART_REMINDERS;
};

export type ReminderCandidate = {
  id: string;
  tenantId: string;
  email: string;
  remindersSent: number;
  lastReminderAt: string | null;
  createdAt: string;
  updatedAt: string;
  /** The checkout's order was paid (or paid then refunded). */
  paid: boolean;
};

export type ReminderContext = {
  /** Reminders each shop sends. */
  settings: Map<string, CartReminderSetting>;
  liveShops: Set<string>;
  /** "tenantId|email" of shoppers who asked not to be reminded. */
  optedOut: Set<string>;
  /** "tenantId|email" → when they last bought. */
  lastSale: Map<string, string>;
  /** "tenantId|email" → their latest checkout activity. */
  latestCheckout: Map<string, string>;
};

const key = (tenantId: string, email: string) => `${tenantId}|${email.toLowerCase()}`;

/** Which reminder (1 or 2) is due for this basket now, or null. Pure, so it's easy to test. */
export function dueReminder(c: ReminderCandidate, ctx: ReminderContext, now: number): 1 | 2 | null {
  const next = c.remindersSent + 1;
  if (next > 2 || next > (ctx.settings.get(c.tenantId) ?? DEFAULT_CART_REMINDERS)) return null;
  if (c.paid || !ctx.liveShops.has(c.tenantId)) return null;
  const k = key(c.tenantId, c.email);
  if (ctx.optedOut.has(k)) return null;
  // They've bought since: nothing to remind them about.
  const sale = ctx.lastSale.get(k);
  if (sale && sale > c.createdAt) return null;
  // Only their most recent basket is reminded; an older one would be out of date.
  const latest = ctx.latestCheckout.get(k);
  if (latest && latest > c.updatedAt) return null;

  const idle = now - new Date(c.updatedAt).getTime();
  if (idle > REMINDER_MAX_AGE_HOURS * 3_600_000) return null;
  if (next === 1) return idle >= FIRST_REMINDER_AFTER_MINUTES * 60_000 ? 1 : null;
  const sinceLast = c.lastReminderAt ? now - new Date(c.lastReminderAt).getTime() : Infinity;
  return idle >= SECOND_REMINDER_AFTER_HOURS * 3_600_000 && sinceLast >= 12 * 3_600_000 ? 2 : null;
}

const store = () => createServerSupabaseClient().schema("store");

type CheckoutRow = {
  id: string;
  tenant_id: string;
  customer_name: string | null;
  customer_email: string;
  items: { name: string; quantity: number; unitPrice: number }[] | null;
  subtotal: number;
  currency: string;
  reminders_sent: number;
  last_reminder_at: string | null;
  reminder_key: string;
  created_at: string;
  updated_at: string;
  orders: { payment_status: string; status: string } | null;
};

/** Sends every reminder that's due, across all shops. Returns how many were sent. */
export async function sendDueCartReminders(now = Date.now()): Promise<number> {
  const { data, error } = await store()
    .from("checkouts")
    .select("id, tenant_id, customer_name, customer_email, items, subtotal, currency, reminders_sent, last_reminder_at, reminder_key, created_at, updated_at, orders(payment_status, status)")
    .not("customer_email", "is", null)
    .eq("follow_up", "none")
    .lt("reminders_sent", 2)
    .lt("updated_at", new Date(now - FIRST_REMINDER_AFTER_MINUTES * 60_000).toISOString())
    .gt("updated_at", new Date(now - REMINDER_MAX_AGE_HOURS * 3_600_000).toISOString())
    .order("updated_at", { ascending: true })
    .limit(200);
  if (error) throw new Error(error.message);
  const rows = (data || []) as unknown as CheckoutRow[];
  if (!rows.length) return 0;

  const tenantIds = [...new Set(rows.map((r) => r.tenant_id))];
  const ctx: ReminderContext = { settings: new Map(), liveShops: new Set(), optedOut: new Set(), lastSale: new Map(), latestCheckout: new Map() };
  const db = createServerSupabaseClient();
  const [{ data: profiles }, { data: tenants }, { data: optOuts }] = await Promise.all([
    store().from("business_profile").select("tenant_id, cart_reminders, business_email").in("tenant_id", tenantIds),
    db.from("tenants").select("id, subdomain, name, display_name").in("id", tenantIds),
    store().from("email_opt_outs").select("tenant_id, email").eq("kind", "cart_reminders").in("tenant_id", tenantIds),
  ]);
  for (const p of profiles || []) ctx.settings.set(p.tenant_id as string, cartReminderSetting(p.cart_reminders));
  for (const o of optOuts || []) ctx.optedOut.add(key(o.tenant_id as string, o.email as string));
  await Promise.all(tenantIds.map(async (id) => (await isShopLive(id)) && ctx.liveShops.add(id)));

  // Later purchases and newer baskets from the same people, shop by shop.
  await Promise.all(
    tenantIds.map(async (tenantId) => {
      const emails = [...new Set(rows.filter((r) => r.tenant_id === tenantId).map((r) => r.customer_email.toLowerCase()))];
      const [{ data: orders }, { data: checkouts }] = await Promise.all([
        store().from("orders").select("customer_email, created_at, payment_status, status").eq("tenant_id", tenantId).in("customer_email", emails),
        store().from("checkouts").select("customer_email, updated_at").eq("tenant_id", tenantId).in("customer_email", emails),
      ]);
      for (const o of orders || []) {
        if (!o.customer_email || !isSale(o.payment_status, o.status)) continue;
        const k = key(tenantId, o.customer_email);
        if ((ctx.lastSale.get(k) ?? "") < o.created_at) ctx.lastSale.set(k, o.created_at);
      }
      for (const c of checkouts || []) {
        if (!c.customer_email) continue;
        const k = key(tenantId, c.customer_email);
        if ((ctx.latestCheckout.get(k) ?? "") < c.updated_at) ctx.latestCheckout.set(k, c.updated_at);
      }
    }),
  );

  const profileFor = new Map((profiles || []).map((p) => [p.tenant_id as string, p]));
  const tenantFor = new Map((tenants || []).map((t) => [t.id as string, t]));
  let sent = 0;

  for (const row of rows) {
    const which = dueReminder(
      {
        id: row.id,
        tenantId: row.tenant_id,
        email: row.customer_email,
        remindersSent: row.reminders_sent,
        lastReminderAt: row.last_reminder_at,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        paid: Boolean(row.orders && (isSale(row.orders.payment_status, row.orders.status) || row.orders.payment_status === "refunded")),
      },
      ctx,
      now,
    );
    const tenant = tenantFor.get(row.tenant_id);
    if (!which || !tenant) continue;

    // Claim it first, so two runs at once can't both send it.
    const { data: claimed } = await store()
      .from("checkouts")
      .update({ reminders_sent: which, last_reminder_at: new Date(now).toISOString() })
      .eq("id", row.id)
      .eq("reminders_sent", which - 1)
      .select("id");
    if (!claimed?.length) continue;

    try {
      await sendReminderEmail(row, which, tenant, (profileFor.get(row.tenant_id)?.business_email as string | null) ?? null);
      sent += 1;
      // And on the device the basket was left on, if the shopper has the shop's notifications there.
      const storeName = (tenant.display_name as string | null)?.trim() || String(tenant.subdomain || tenant.name);
      await sendLinkedPush(row.tenant_id, "checkout", row.id, {
        title: which === 1 ? "You left something in your basket" : "Your basket is still waiting",
        body: `We've kept your basket at ${storeName}. Tap to pick up where you left off.`,
        path: `/cart?restore=${row.reminder_key}`,
        tag: `basket-${row.id}`,
      });
      // Don't remind about another basket from the same person in this run.
      ctx.optedOut.add(key(row.tenant_id, row.customer_email));
    } catch (err) {
      console.error("[cart reminders] email not sent", err);
      // Put it back, so the next run tries again.
      await store().from("checkouts").update({ reminders_sent: which - 1, last_reminder_at: row.last_reminder_at }).eq("id", row.id);
    }
  }
  return sent;
}

/**
 * Runs the reminder sweep at most once every ten minutes, whoever asks. Called
 * after busy requests (shop pages, the dashboard), alongside the daily cron,
 * so reminders go out close to on time without an hourly cron job.
 */
export async function runCartRemindersIfDue() {
  try {
    if (!(await rateLimitShared("job:cart-reminders", 1, 10 * 60_000)).ok) return;
    await sendDueCartReminders();
  } catch (err) {
    console.error("[cart reminders] run failed", err);
  }
}

export const reminderLinks = (slug: string, reminderKey: string) => {
  const shop = storefrontUrl(slug);
  return {
    restore: `${shop}/cart?restore=${reminderKey}`,
    stop: `${shop}/reminders?k=${reminderKey}`,
    oneClickStop: `${shop}/api/shop/${slug}/reminders?k=${reminderKey}`,
  };
};

async function sendReminderEmail(
  row: CheckoutRow,
  which: 1 | 2,
  tenant: { subdomain?: unknown; name?: unknown; display_name?: unknown },
  shopEmail: string | null,
) {
  const slug = String(tenant.subdomain || tenant.name);
  const storeName = (tenant.display_name as string | null)?.trim() || slug;
  const money = (v: number) => formatShopCurrency(v, row.currency);
  const first = row.customer_name?.trim().split(/\s+/)[0] || "there";
  const items = row.items || [];
  const links = reminderLinks(slug, row.reminder_key);
  const subject = which === 1 ? `You left something in your basket at ${storeName}` : `Still thinking it over? Your basket at ${storeName} is waiting`;
  const intro =
    which === 1
      ? `Hello ${first}, you didn't quite finish your order at ${storeName}. We've kept your basket, so it's ready when you are.`
      : `Hello ${first}, just a quick reminder that your basket at ${storeName} is still saved. If you had a question about delivery or payment, reply to this email and the shop will help.`;

  await sendBrandedEmail({
    to: row.customer_email,
    subject,
    replyTo: shopEmail,
    headers: {
      "List-Unsubscribe": `<${links.oneClickStop}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
    text: [
      intro,
      "",
      ...items.map((i) => `${i.quantity} × ${i.name} (${money(i.unitPrice * i.quantity)})`),
      `Basket total: ${money(Number(row.subtotal) || 0)}`,
      "",
      `Finish your order: ${links.restore}`,
      "",
      `Prices and stock are checked again when you return. Don't want these reminders? ${links.stop}`,
    ].join("\n"),
    layout: {
      preheader: `Your basket at ${storeName} is saved. Pick up where you left off.`,
      badges: [badge("Your basket", "blue")],
      title: which === 1 ? "Your basket is waiting" : "Your basket is still saved",
      intro,
      body: `${detailsPanel([
        ...items.map((i) => ({ label: `${i.quantity} ×`, value: `${i.name} (${money(i.unitPrice * i.quantity)})` })),
        { label: "Basket total", value: money(Number(row.subtotal) || 0) },
      ])}
      <p style="margin:20px 0 0;color:#475569;font-size:13px;line-height:1.6">Prices and stock are checked again when you return. Don&rsquo;t want these reminders? <a href="${escapeHtml(links.stop)}" style="color:#475569">Stop basket reminders from ${escapeHtml(storeName)}</a>.</p>`,
      buttons: [{ label: "Finish your order", href: links.restore }],
      footerNote: `You're receiving this because you started an order with ${storeName} and left your email address at checkout.`,
    },
  });
}

/** Finds a checkout by the private key in a reminder email. */
async function checkoutByKey(tenantId: string, reminderKey: string) {
  if (!/^[0-9a-f-]{36}$/i.test(reminderKey)) return null;
  const { data } = await store()
    .from("checkouts")
    .select("id, customer_email, items")
    .eq("tenant_id", tenantId)
    .eq("reminder_key", reminderKey)
    .maybeSingle();
  return data;
}

/** The basket from a reminder email, rebuilt from today's products. Items no longer on sale or out of stock are left out. */
export async function reminderBasket(tenantId: string, reminderKey: string): Promise<CartLine[] | null> {
  const checkout = await checkoutByKey(tenantId, reminderKey);
  if (!checkout) return null;
  return rebuildBasket(tenantId, checkout.items);
}

/**
 * A saved basket (a reminder's, or one kept on a shopper's account) as basket
 * lines rebuilt from today's products: today's names, photos, prices and stock.
 * Items no longer on sale or out of stock are left out.
 */
export async function rebuildBasket(tenantId: string, items: unknown): Promise<CartLine[]> {
  const saved = ((Array.isArray(items) ? items : []) as { productId?: string; variantId?: string | null; quantity?: number }[]).filter(
    (i): i is { productId: string; variantId: string | null; quantity: number } => typeof i.productId === "string" && Number(i.quantity) > 0,
  );
  const products = new Map((await getShopProductsByIds(tenantId, saved.map((i) => i.productId))).map((p) => [p.id, p]));

  const lines: CartLine[] = [];
  for (const item of saved) {
    const product = products.get(item.productId);
    if (!product) continue;
    const variant = item.variantId ? product.variants.find((v) => v.id === item.variantId) : null;
    if (item.variantId && !variant) continue;
    const stock = variant ? variant.stock : product.stock;
    const maxQuantity = product.allowBackorder ? 999 : Math.max(stock, 0);
    const minQuantity = Math.max(1, product.minimumOrderQty || 1);
    // Sold out, or fewer left than the shop's minimum order: it can't be bought, so it isn't put back.
    if (maxQuantity < minQuantity) continue;
    lines.push({
      productId: product.id,
      variantId: variant?.id ?? null,
      name: product.name,
      variantLabel: variant ? Object.values(variant.options).join(" · ") : null,
      imageUrl: variant?.imageUrl || product.imageUrl,
      unitPrice: product.price,
      currency: product.currency,
      fixedPrices: variant?.priceOverride != null ? undefined : fixedLinePrices(product.fixedPrices),
      deliveryExtra: product.deliveryExtra || undefined,
      quantity: Math.min(Math.max(item.quantity, minQuantity), maxQuantity),
      maxQuantity,
      minQuantity,
    });
  }
  // Today's price for each line, sale and size included.
  const priced = await priceBasketLines(tenantId, lines.map((l) => ({ productId: l.productId, variantId: l.variantId, quantity: l.quantity })));
  return lines.map((l, i) => ({ ...l, unitPrice: priced[i]?.unitPrice ?? l.unitPrice }));
}

/** "Don't remind me": no more basket reminders from this shop to this email address. */
export async function stopCartReminders(tenantId: string, reminderKey: string) {
  const checkout = await checkoutByKey(tenantId, reminderKey);
  if (!checkout?.customer_email) return false;
  const { error } = await store()
    .from("email_opt_outs")
    .upsert({ tenant_id: tenantId, email: String(checkout.customer_email).toLowerCase(), kind: "cart_reminders" }, { onConflict: "tenant_id,email,kind" });
  if (error) throw new Error(error.message);
  return true;
}

/** The shop's reminder setting. */
export async function getCartReminderSetting(tenantId: string): Promise<CartReminderSetting> {
  const { data } = await store().from("business_profile").select("cart_reminders").eq("tenant_id", tenantId).maybeSingle();
  return cartReminderSetting(data?.cart_reminders);
}

export async function setCartReminderSetting(tenantId: string, value: CartReminderSetting) {
  // Upsert: a shop that hasn't filled in its business details yet has no row.
  const { error } = await store().from("business_profile").upsert({ tenant_id: tenantId, cart_reminders: value }, { onConflict: "tenant_id" });
  if (error) throw new Error(error.message);
}

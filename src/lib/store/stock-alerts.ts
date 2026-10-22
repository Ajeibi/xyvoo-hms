import { z } from "zod";
import { badge, escapeHtml } from "@/lib/mail/layout";
import { sendBrandedEmail } from "@/lib/mail/mailtrap";
import { rateLimitShared } from "@/lib/rate-limit";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { sendLinkedPush } from "./push-links";
import { isShopLive } from "./site/data";
import { STORE_PATHS } from "./site/links";
import { storefrontUrl } from "./subdomain";

/*
 * Back-in-stock alerts (store.stock_alerts). Shoppers ask on a sold-out
 * product; when it's available again each of them gets one email. Stock
 * changes in many places (edits, imports, refunds, cancelled orders), so rather
 * than hooking each one, the sweep looks for waiting requests whose product is
 * available again. It runs right after a product is saved, after busy shop and
 * dashboard requests (at most every ten minutes) and from the daily cron.
 */

const store = () => createServerSupabaseClient().schema("store");

export const stockAlertSchema = z.object({
  productId: z.string().uuid(),
  variantId: z.string().uuid().nullable().optional(),
  email: z.string().trim().toLowerCase().max(200).email("Enter an email address in the format name@example.com.").optional(),
});

/**
 * Saves a request and returns its id, or null if the product isn't this shop's. Asking twice is fine. With no
 * email, the shopper asked for a notification on their device instead (linked to the request by the caller).
 */
export async function requestStockAlert(
  tenantId: string,
  input: { productId: string; variantId?: string | null; email: string | null; name?: string | null; accountId?: string | null },
): Promise<string | null> {
  const { data: product } = await store()
    .from("products")
    .select("id, stock, allow_backorder, product_variants(id, stock)")
    .eq("tenant_id", tenantId)
    .eq("id", input.productId)
    .eq("status", "active")
    .maybeSingle();
  if (!product) return null;
  const variants = (product.product_variants as { id: string; stock: number }[]) || [];
  const variant = input.variantId ? variants.find((v) => v.id === input.variantId) : null;
  if (input.variantId && !variant) return null;

  const email = input.email?.toLowerCase() || null;
  const { data, error } = await store()
    .from("stock_alerts")
    .insert({
      tenant_id: tenantId,
      product_id: input.productId,
      variant_id: variant?.id ?? null,
      email,
      name: input.name?.slice(0, 120) || null,
      customer_account_id: input.accountId ?? null,
    })
    .select("id")
    .single();
  if (!error) return data.id as string;
  if (error.code !== "23505" || !email) throw new Error(error.message);
  // Already waiting: the earlier request.
  let existing = store().from("stock_alerts").select("id").eq("tenant_id", tenantId).eq("product_id", input.productId).eq("email", email).is("notified_at", null);
  existing = variant ? existing.eq("variant_id", variant.id) : existing.is("variant_id", null);
  const { data: found } = await existing.limit(1).maybeSingle();
  return (found?.id as string | undefined) ?? null;
}

type PendingRow = {
  id: string;
  tenant_id: string;
  /** Empty when the shopper asked for a notification on their device instead. */
  email: string | null;
  name: string | null;
  variant_id: string | null;
  product: {
    id: string;
    name: string;
    slug: string | null;
    image_url: string | null;
    stock: number;
    allow_backorder: boolean;
    status: string;
    visibility: string;
    approval_status: string;
  } | null;
  variant: { stock: number; options: Record<string, string> | null } | null;
};

/** Whether a waiting request can be sent: the product is on sale again and has stock. Pure, for tests. */
export function alertReady(row: Pick<PendingRow, "product" | "variant" | "variant_id">) {
  const p = row.product;
  if (!p || p.status !== "active" || p.visibility !== "visible" || p.approval_status !== "approved") return false;
  if (p.allow_backorder) return true;
  if (row.variant_id) return Boolean(row.variant && row.variant.stock > 0);
  return p.stock > 0;
}

/** Sends every alert whose product is back, for one shop or all of them. Returns how many were sent. */
export async function sendDueStockAlerts(tenantId?: string, productIds?: string[]): Promise<number> {
  let query = store()
    .from("stock_alerts")
    .select(
      "id, tenant_id, email, name, variant_id, product:product_id(id, name, slug, image_url, stock, allow_backorder, status, visibility, approval_status), variant:variant_id(stock, options)",
    )
    .is("notified_at", null)
    .order("created_at", { ascending: true })
    .limit(300);
  if (tenantId) query = query.eq("tenant_id", tenantId);
  if (productIds?.length) query = query.in("product_id", productIds);
  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const ready = ((data || []) as unknown as PendingRow[]).filter(alertReady);
  if (!ready.length) return 0;

  const tenantIds = [...new Set(ready.map((r) => r.tenant_id))];
  const db = createServerSupabaseClient();
  const [{ data: tenants }, { data: profiles }] = await Promise.all([
    db.from("tenants").select("id, subdomain, name, display_name").in("id", tenantIds),
    store().from("business_profile").select("tenant_id, business_email").in("tenant_id", tenantIds),
  ]);
  const live = new Set<string>();
  await Promise.all(tenantIds.map(async (id) => (await isShopLive(id)) && live.add(id)));
  const tenantFor = new Map((tenants || []).map((t) => [t.id as string, t]));
  const replyTo = new Map((profiles || []).map((p) => [p.tenant_id as string, (p.business_email as string | null) ?? null]));

  let sent = 0;
  for (const row of ready) {
    const tenant = tenantFor.get(row.tenant_id);
    if (!tenant || !live.has(row.tenant_id)) continue;
    // Claim it first, so two runs at once can't both send it.
    const { data: claimed } = await store().from("stock_alerts").update({ notified_at: new Date().toISOString() }).eq("id", row.id).is("notified_at", null).select("id");
    if (!claimed?.length) continue;
    try {
      if (row.email) await sendStockAlertEmail(row, tenant, replyTo.get(row.tenant_id) ?? null);
      const product = row.product!;
      const option = row.variant?.options ? Object.values(row.variant.options).join(" · ") : "";
      const reached = await sendLinkedPush(row.tenant_id, "stock_alert", row.id, {
        title: "It's back in stock",
        body: `${option ? `${product.name} (${option})` : product.name} is available again. Have a look before it sells out.`,
        path: STORE_PATHS.product(product.slug || product.id),
        tag: `restock-${row.id}`,
      });
      if (row.email || reached) sent += 1;
    } catch (err) {
      console.error("[stock alerts] email not sent", err);
      await store().from("stock_alerts").update({ notified_at: null }).eq("id", row.id);
    }
  }
  return sent;
}

/** At most every ten minutes, whoever asks (see runCartRemindersIfDue). Also tidies up old requests. */
export async function runStockAlertsIfDue() {
  try {
    if (!(await rateLimitShared("job:stock-alerts", 1, 10 * 60_000)).ok) return;
    await sendDueStockAlerts();
    await store().from("stock_alerts").delete().is("notified_at", null).lt("created_at", new Date(Date.now() - 183 * 86_400_000).toISOString());
  } catch (err) {
    console.error("[stock alerts] run failed", err);
  }
}

/** Straight after products are saved: tell anyone waiting for them. Never throws. */
export async function sendStockAlertsForProducts(tenantId: string, productIds: string[]) {
  try {
    if (productIds.length) await sendDueStockAlerts(tenantId, productIds);
  } catch (err) {
    console.error("[stock alerts] after save failed", err);
  }
}

async function sendStockAlertEmail(row: PendingRow, tenant: { subdomain?: unknown; name?: unknown; display_name?: unknown }, shopEmail: string | null) {
  const product = row.product!;
  const slug = String(tenant.subdomain || tenant.name);
  const storeName = (tenant.display_name as string | null)?.trim() || slug;
  const option = row.variant?.options ? Object.values(row.variant.options).join(" · ") : "";
  const what = option ? `${product.name} (${option})` : product.name;
  const url = `${storefrontUrl(slug)}${STORE_PATHS.product(product.slug || product.id)}`;
  const greeting = row.name ? `Hello ${row.name.split(/\s+/)[0]}, ` : "Hello, ";
  const intro = `${greeting}good news: ${what} is back in stock at ${storeName}. It may not last long, so have a look while it's available.`;

  await sendBrandedEmail({
    to: row.email!,
    subject: `${what} is back in stock at ${storeName}`,
    replyTo: shopEmail,
    text: [intro, "", `See it here: ${url}`, "", "You asked us to tell you when it was back. This is the only email we'll send about it."].join("\n"),
    layout: {
      preheader: `${what} is available again. Have a look before it sells out.`,
      badges: [badge("Back in stock", "green")],
      title: "It's back in stock",
      intro,
      body: product.image_url
        ? `<p style="margin:0 0 8px;text-align:center"><img src="${escapeHtml(product.image_url)}" alt="${escapeHtml(product.name)}" width="240" style="max-width:100%;height:auto;border-radius:12px"></p>`
        : undefined,
      buttons: [{ label: "See it now", href: url }],
      footerNote: `You asked ${storeName} to tell you when this was back in stock. This is the only email we'll send about it.`,
    },
  });
}

/** Waiting requests per product, for the dashboard. */
export async function waitingCounts(tenantId: string): Promise<Record<string, number>> {
  const { data } = await store().from("stock_alerts").select("product_id").eq("tenant_id", tenantId).is("notified_at", null).limit(10_000);
  const counts: Record<string, number> = {};
  for (const r of data || []) counts[r.product_id as string] = (counts[r.product_id as string] ?? 0) + 1;
  return counts;
}

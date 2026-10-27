import { after } from "next/server";
import { badge, detailsPanel } from "@/lib/mail/layout";
import { sendBrandedEmail } from "@/lib/mail/mailtrap";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { CustomerAccount } from "./customer-accounts";
import { DEFAULT_RETURN_DAYS, nextReturnStatus, RETURN_REASON_LABELS, returnableQuantity, type ReturnAction, type ReturnReason, type ReturnStatus } from "./returns";
import { storefrontUrl } from "./subdomain";
import { layoutWords, savedLanguage, shopperEmailT } from "./order-emails";

const db = () => createServerSupabaseClient().schema("store");
const missing = (error: { code?: string } | null) => Boolean(error && ["42P01", "42703", "PGRST205", "PGRST204", "PGRST202"].includes(error.code ?? ""));

export class ReturnError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export async function getReturnWindow(tenantId: string): Promise<number> {
  const { data, error } = await db().from("business_profile").select("return_window_days").eq("tenant_id", tenantId).maybeSingle();
  if (error && !missing(error)) throw new Error(error.message);
  const days = Number(data?.return_window_days);
  return Number.isFinite(days) ? days : DEFAULT_RETURN_DAYS;
}

export async function saveReturnWindow(tenantId: string, days: number) {
  const { error } = await db().from("business_profile").upsert({ tenant_id: tenantId, return_window_days: days }, { onConflict: "tenant_id" });
  if (error) throw new Error(error.message);
}

export type ReturnableOrder = {
  orderId: string;
  reference: string;
  deliveredAt: string;
  lines: { orderItemId: string; name: string; maxQuantity: number; windowDays: number }[];
};

/** An order's items that can still be returned by this customer (an empty list when none can), or a reason it can't be. */
export async function returnableOrder(tenantId: string, account: CustomerAccount, orderId: string, now = new Date()): Promise<ReturnableOrder> {
  const { data: order } = await db()
    .from("orders")
    .select("id, status, payment_status, customer_account_id, customer_email, updated_at")
    .eq("tenant_id", tenantId)
    .eq("id", orderId)
    .maybeSingle();
  const mine = order && (order.customer_account_id === account.id || String(order.customer_email || "").toLowerCase() === account.email);
  if (!order || !mine) throw new ReturnError("NOT_FOUND", "We couldn't find that order.");
  if (order.status !== "Delivered" || order.payment_status !== "paid") throw new ReturnError("NOT_DELIVERED", "You can ask to return an order once it has been delivered.");

  const [{ data: items }, { data: events }, shopDays] = await Promise.all([
    db().from("order_items").select("id, product_id, product_name, quantity").eq("order_id", orderId),
    db().from("order_events").select("created_at, data").eq("tenant_id", tenantId).eq("order_id", orderId).eq("kind", "status_changed").order("created_at", { ascending: false }).limit(10),
    getReturnWindow(tenantId),
  ]);
  const deliveredAt = ((events || []).find((e) => (e.data as { to?: string } | null)?.to === "Delivered")?.created_at as string | undefined) ?? (order.updated_at as string);

  const productIds = [...new Set((items || []).map((i) => i.product_id as string | null).filter((id): id is string => Boolean(id)))];
  const { data: products } = productIds.length ? await db().from("products").select("id, returnable, return_window_days").in("id", productIds) : { data: [] };
  const policy = new Map((products || []).map((p) => [p.id as string, p]));
  const { data: open } = (items || []).length
    ? await db().from("return_items").select("order_item_id, quantity, returns!inner(status)").in("order_item_id", (items || []).map((i) => i.id as string))
    : { data: [] };
  const requested = new Map<string, number>();
  for (const r of (open || []) as unknown as { order_item_id: string; quantity: number; returns: { status: string } | { status: string }[] }[]) {
    const status = Array.isArray(r.returns) ? r.returns[0]?.status : r.returns?.status;
    if (status === "declined" || status === "cancelled") continue;
    requested.set(r.order_item_id, (requested.get(r.order_item_id) ?? 0) + r.quantity);
  }

  const lines = (items || [])
    .map((i) => {
      const p = i.product_id ? policy.get(i.product_id as string) : null;
      const windowDays = p?.return_window_days != null ? Number(p.return_window_days) : shopDays;
      const maxQuantity = returnableQuantity(
        { quantity: Number(i.quantity), alreadyRequested: requested.get(i.id as string) ?? 0, returnable: p ? p.returnable !== false : true, windowDays },
        deliveredAt,
        now,
      );
      return { orderItemId: i.id as string, name: i.product_name as string, maxQuantity, windowDays };
    })
    .filter((l) => l.maxQuantity > 0);
  return { orderId, reference: orderId.slice(0, 8).toUpperCase(), deliveredAt, lines };
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

export type ReturnItemRow = { orderItemId: string; name: string; quantity: number };
export type ReturnRow = {
  id: string;
  orderId: string;
  orderRef: string;
  status: ReturnStatus;
  reason: ReturnReason;
  note: string | null;
  shopMessage: string | null;
  customerEmail: string;
  items: ReturnItemRow[];
  createdAt: string;
};

const RETURN_COLUMNS = "id, order_id, status, reason, note, shop_message, customer_email, created_at, return_items(order_item_id, quantity, order_items(product_name))";

function toRow(r: Record<string, unknown>): ReturnRow {
  const items = ((r.return_items as { order_item_id: string; quantity: number; order_items: { product_name: string } | { product_name: string }[] | null }[]) || []).map((i) => {
    const oi = Array.isArray(i.order_items) ? i.order_items[0] : i.order_items;
    return { orderItemId: i.order_item_id, name: oi?.product_name ?? "Item", quantity: i.quantity };
  });
  return {
    id: r.id as string,
    orderId: r.order_id as string,
    orderRef: String(r.order_id).slice(0, 8).toUpperCase(),
    status: r.status as ReturnStatus,
    reason: r.reason as ReturnReason,
    note: (r.note as string | null) ?? null,
    shopMessage: (r.shop_message as string | null) ?? null,
    customerEmail: r.customer_email as string,
    items,
    createdAt: r.created_at as string,
  };
}

export async function createReturnRequest(tenantId: string, account: CustomerAccount, input: { orderId: string; items: { orderItemId: string; quantity: number }[]; reason: ReturnReason; note?: string }) {
  const eligible = await returnableOrder(tenantId, account, input.orderId);
  for (const item of input.items) {
    const line = eligible.lines.find((l) => l.orderItemId === item.orderItemId);
    if (!line) throw new ReturnError("NOT_RETURNABLE", "One of those items can't be returned, or its return window has closed.");
    if (item.quantity > line.maxQuantity) throw new ReturnError("TOO_MANY", `You can return up to ${line.maxQuantity} of “${line.name}”.`);
  }
  const { data, error } = await db().rpc("create_return", {
    p_tenant_id: tenantId,
    p_order_id: input.orderId,
    p_account_id: account.id,
    p_email: account.email,
    p_reason: input.reason,
    p_note: input.note ?? "",
    p_items: input.items.map((i) => ({ order_item_id: i.orderItemId, quantity: i.quantity })),
  });
  if (error) throw new Error(error.message);
  const result = data as { status: string; return_id?: string };
  if (result.status === "too_many") throw new ReturnError("TOO_MANY", "Some of those items are already part of another return.");
  if (result.status !== "ok" || !result.return_id) throw new ReturnError("NOT_FOUND", "We couldn't start that return. Please try again.");

  // Tell the shop in the background. Never stops the return, and the customer isn't kept waiting.
  after(async () => {
    try {
    const shop = await getShop(tenantId);
    if (shop.shopEmail) {
      const lines = input.items.map((i) => `${i.quantity} × ${eligible.lines.find((l) => l.orderItemId === i.orderItemId)?.name ?? "item"}`);
      await sendBrandedEmail({
        to: shop.shopEmail,
        subject: `Return requested on order ${eligible.reference}`,
        text: [`${account.name || account.email} would like to return:`, ...lines, `Reason: ${RETURN_REASON_LABELS[input.reason]}`, input.note ? `Note: ${input.note}` : "", "", "Open Returns in your dashboard to approve or decline it."].filter(Boolean).join("\n"),
        layout: {
          preheader: `A customer asked to return something from order ${eligible.reference}.`,
          badges: [badge("Return requested", "amber")],
          title: `Return requested on order ${eligible.reference}`,
          intro: `${account.name || account.email} would like to send something back.`,
          body: detailsPanel([
            { label: "Items", value: lines.join(", ") },
            { label: "Reason", value: RETURN_REASON_LABELS[input.reason] },
            ...(input.note ? [{ label: "Their note", value: input.note }] : []),
          ]),
          buttons: [{ label: "Open Returns", href: `${process.env.NEXT_PUBLIC_APP_URL || ""}/storefront/${shop.slug}/returns` }],
          footerNote: `You're receiving this because a customer asked to return something to ${shop.storeName}.`,
        },
      });
    }
    } catch (err) {
      console.error("[returns] shop not told", err);
    }
  });
  return result.return_id;
}

export async function accountReturns(tenantId: string, account: CustomerAccount): Promise<ReturnRow[]> {
  const { data, error } = await db().from("returns").select(RETURN_COLUMNS).eq("tenant_id", tenantId).or(`account_id.eq.${account.id},customer_email.eq.${account.email}`).order("created_at", { ascending: false }).limit(30);
  if (error) {
    if (missing(error)) return [];
    throw new Error(error.message);
  }
  return (data || []).map(toRow);
}

export async function listReturns(tenantId: string): Promise<ReturnRow[]> {
  const { data, error } = await db().from("returns").select(RETURN_COLUMNS).eq("tenant_id", tenantId).order("created_at", { ascending: false }).limit(200);
  if (error) {
    if (missing(error)) return [];
    throw new Error(error.message);
  }
  return (data || []).map(toRow);
}

/** Moves a return along and emails the customer when it matters. */
export async function decideReturn(tenantId: string, id: string, action: ReturnAction, message: string | undefined) {
  const { data: row } = await db().from("returns").select(RETURN_COLUMNS).eq("tenant_id", tenantId).eq("id", id).maybeSingle();
  if (!row) throw new ReturnError("NOT_FOUND", "That return can't be found.");
  const current = toRow(row);
  const next = nextReturnStatus(current.status, action);
  if (!next) throw new ReturnError("CONFLICT", "That can't be done at this stage of the return. Please refresh the page.");

  const now = new Date().toISOString();
  const { data: updated, error } = await db()
    .from("returns")
    .update({
      status: next,
      shop_message: message?.trim() ? message.trim() : current.shopMessage,
      ...(next === "approved" || next === "declined" ? { decided_at: now } : {}),
      ...(next === "received" ? { received_at: now } : {}),
      ...(next === "completed" || next === "cancelled" ? { closed_at: now } : {}),
    })
    .eq("tenant_id", tenantId)
    .eq("id", id)
    .eq("status", current.status)
    .select("id")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!updated) throw new ReturnError("CONFLICT", "Someone else just changed this return. Please refresh the page.");

  if (next === "approved" || next === "declined" || next === "received") {
    after(async () => {
      try {
        await emailCustomer(tenantId, current, next, message?.trim() || null);
      } catch (err) {
        console.error("[returns] customer not emailed", err);
      }
    });
  }
  return { ...current, status: next };
}

async function emailCustomer(tenantId: string, ret: ReturnRow, status: "approved" | "declined" | "received", message: string | null) {
  const shop = await getShop(tenantId);
  // In the language the shopper placed the order in.
  const t = await shopperEmailT(tenantId, await savedLanguage("orders", tenantId, ret.orderId));
  const items = ret.items.map((i) => `${i.quantity} × ${i.name}`);
  const words = { shop: shop.storeName, ref: ret.orderRef };
  const copy = {
    approved: { title: t("emails.returnApprovedTitle"), intro: t("emails.returnApprovedIntro", words), badgeLabel: t("emails.badgeReturnApproved"), tone: "green" as const },
    declined: { title: t("emails.returnDeclinedTitle"), intro: t("emails.returnDeclinedIntro", words), badgeLabel: t("emails.badgeReturnDeclined"), tone: "amber" as const },
    received: { title: t("emails.returnReceivedTitle"), intro: t("emails.returnReceivedIntro", words), badgeLabel: t("emails.badgeReturnReceived"), tone: "blue" as const },
  }[status];
  const fromShop = t("emails.labelMessageFromShop");
  await sendBrandedEmail({
    to: ret.customerEmail,
    subject: t("emails.returnSubject", { title: copy.title, ref: ret.orderRef }),
    replyTo: shop.shopEmail,
    text: [copy.intro, "", ...items, message ? `\n${fromShop}: ${message}` : "", `\n${storefrontUrl(shop.slug)}/account`].filter(Boolean).join("\n"),
    layout: {
      ...layoutWords(t),
      preheader: copy.title,
      badges: [badge(copy.badgeLabel, copy.tone)],
      title: copy.title,
      intro: copy.intro,
      body: `${detailsPanel([{ label: t("emails.labelItems"), value: items.join(", ") }, ...(message ? [{ label: fromShop, value: message }] : [])])}`,
      buttons: [{ label: t("emails.goToAccount"), href: `${storefrontUrl(shop.slug)}/account` }],
      footerNote: t("emails.returnFooter", { shop: shop.storeName }),
    },
  });
}

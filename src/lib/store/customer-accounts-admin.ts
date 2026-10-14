import { createServerSupabaseClient } from "@/lib/supabase/server";

/*
 * The shop's view of shopper accounts: people who signed up but haven't bought
 * yet, what they've looked at and what's in their basket, so the shop can help
 * them. Contact details are only offered for follow-up when the shopper agreed.
 */

export type ShopperAccountRow = {
  id: string;
  name: string | null;
  email: string;
  phone: string | null;
  contactConsent: boolean;
  source: "prompt" | "account_page" | "checkout";
  createdAt: string;
  lastSeenAt: string;
  basket: { name: string; quantity: number; unitPrice: number }[];
  basketUpdatedAt: string | null;
  viewed: { name: string; views: number }[];
};

const store = () => createServerSupabaseClient().schema("store");

/** Accounts with no orders yet, newest activity first. */
export async function listShoppersNotBought(tenantId: string, limit = 200): Promise<ShopperAccountRow[]> {
  const [{ data: accounts, error }, { data: ordered }] = await Promise.all([
    store()
      .from("customer_accounts")
      .select("id, name, email, phone, contact_consent, source, created_at, last_seen_at, basket, basket_updated_at")
      .eq("tenant_id", tenantId)
      .order("last_seen_at", { ascending: false })
      .limit(1000),
    store().from("orders").select("customer_account_id, customer_email").eq("tenant_id", tenantId),
  ]);
  if (error) throw new Error(error.message);

  const boughtIds = new Set((ordered || []).map((o) => o.customer_account_id).filter(Boolean));
  const boughtEmails = new Set((ordered || []).map((o) => String(o.customer_email || "").toLowerCase()).filter(Boolean));
  const waiting = (accounts || []).filter((a) => !boughtIds.has(a.id) && !boughtEmails.has(String(a.email))).slice(0, limit);
  if (!waiting.length) return [];

  const { data: views } = await store()
    .from("customer_product_views")
    .select("account_id, views, last_viewed_at, product:product_id(name)")
    .eq("tenant_id", tenantId)
    .in("account_id", waiting.map((a) => a.id))
    .order("last_viewed_at", { ascending: false });
  const viewsFor = new Map<string, { name: string; views: number }[]>();
  for (const v of views || []) {
    const list = viewsFor.get(v.account_id as string) ?? [];
    const product = v.product as unknown as { name: string } | null;
    if (product && list.length < 5) list.push({ name: product.name, views: Number(v.views) || 1 });
    viewsFor.set(v.account_id as string, list);
  }

  return waiting.map((a) => ({
    id: a.id as string,
    name: (a.name as string | null) ?? null,
    email: a.email as string,
    phone: (a.phone as string | null) ?? null,
    contactConsent: Boolean(a.contact_consent),
    source: a.source as ShopperAccountRow["source"],
    createdAt: a.created_at as string,
    lastSeenAt: a.last_seen_at as string,
    basket: ((a.basket as ShopperAccountRow["basket"]) || []).map((b) => ({ name: b.name, quantity: b.quantity, unitPrice: Number(b.unitPrice) || 0 })),
    basketUpdatedAt: (a.basket_updated_at as string | null) ?? null,
    viewed: viewsFor.get(a.id as string) ?? [],
  }));
}

/** How many accounts the shop has in all, for the figures at the top. */
export async function countShopperAccounts(tenantId: string) {
  const { count } = await store().from("customer_accounts").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId);
  return count ?? 0;
}

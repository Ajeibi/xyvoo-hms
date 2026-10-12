import { createServerSupabaseClient } from "@/lib/supabase/server";
import { FREE_RULE_COLUMNS, mapFreeRule, type CheckoutFreeRule, type FreeDeliveryRuleRow } from "./free-delivery";

/**
 * A shop's free delivery rules that apply now, in order, ready for checkout.
 * A rule's collections are turned into the products they hold, so checkout
 * only needs product ids. Returns [] if the rules table isn't there yet.
 */
export async function getCheckoutFreeRules(tenantId: string): Promise<CheckoutFreeRule[]> {
  const db = createServerSupabaseClient().schema("store");
  const { data, error } = await db
    .from("delivery_free_rules")
    .select(FREE_RULE_COLUMNS)
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .order("sort_order")
    .order("created_at");
  if (error || !data?.length) return [];

  const now = Date.now();
  const rules = (data as FreeDeliveryRuleRow[]).map(mapFreeRule).filter((r) => !r.endsAt || new Date(r.endsAt).getTime() > now);

  const collectionIds = [...new Set(rules.flatMap((r) => r.collectionIds))];
  const inCollection = new Map<string, string[]>();
  if (collectionIds.length) {
    const { data: members } = await db.from("collection_products").select("collection_id, product_id").in("collection_id", collectionIds);
    for (const m of members || []) {
      const list = inCollection.get(m.collection_id as string) ?? [];
      list.push(m.product_id as string);
      inCollection.set(m.collection_id as string, list);
    }
  }

  return rules.map((r) => ({
    id: r.id,
    name: r.name,
    areas: r.areas,
    minSubtotal: r.minSubtotal,
    minItems: r.minItems,
    startsAt: r.startsAt,
    endsAt: r.endsAt,
    includeExtras: r.includeExtras,
    hasProductCondition: r.productIds.length > 0 || r.collectionIds.length > 0,
    productIds: [...new Set([...r.productIds, ...r.collectionIds.flatMap((c) => inCollection.get(c) ?? [])])],
  }));
}

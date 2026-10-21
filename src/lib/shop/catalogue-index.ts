import { cache } from "react";
import { unstable_cache } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { shopTag } from "@/lib/store/site/shop-changed";
import { LEGACY_PRODUCT_COLUMNS, mapRows, missingSaleColumns, SHOP_PRODUCT_COLUMNS, type ShopProduct, type ShopProductRow } from "./products";

/*
 * A shop's whole visible catalogue, for search and filters (catalogue-filter.ts).
 * The rows are kept between page views with the shop's other shared data and
 * cleared on every product save (shopChanged); sale prices are worked out
 * fresh on each view, so a sale starts and ends on time.
 */

/** A safety net, as for the rest of the shop's cached data. */
const CATALOGUE_SECONDS = 60;
/** The database hands back at most this many rows at a time. */
const PAGE = 1000;
/** A ceiling for very large catalogues: beyond it, the newest are searched. */
const MAX_PRODUCTS = 5000;
/** Search only needs the start of a long description. */
const DESCRIPTION_CHARS = 400;

async function loadRows(tenantId: string): Promise<ShopProductRow[]> {
  const db = createServerSupabaseClient().schema("store");
  const read = (columns: string, from: number) =>
    db
      .from("products")
      .select(columns)
      .eq("tenant_id", tenantId)
      .eq("status", "active")
      .eq("visibility", "visible")
      .eq("approval_status", "approved")
      .order("created_at", { ascending: false })
      .order("id")
      .range(from, from + PAGE - 1);

  let columns = SHOP_PRODUCT_COLUMNS;
  const rows: ShopProductRow[] = [];
  for (let from = 0; from < MAX_PRODUCTS; from += PAGE) {
    let { data, error } = await read(columns, from);
    if (missingSaleColumns(error)) {
      columns = LEGACY_PRODUCT_COLUMNS;
      ({ data, error } = await read(columns, from));
    }
    if (error) throw new Error(error.message);
    const page = (data || []) as unknown as ShopProductRow[];
    for (const row of page) rows.push({ ...row, description: row.description ? row.description.slice(0, DESCRIPTION_CHARS) : null });
    if (page.length < PAGE) break;
  }
  return rows;
}

/** Every visible product in the shop, newest first, with today's prices. Read once per request. */
export const getShopCatalogue = cache(async (tenantId: string): Promise<ShopProduct[]> => {
  const rows = await unstable_cache(() => loadRows(tenantId), ["shop-catalogue-v1", tenantId], { tags: [shopTag(tenantId)], revalidate: CATALOGUE_SECONDS })();
  return mapRows(tenantId, rows);
});

/** A collection's products and the merchant's order for them (product id to position). */
export async function getCollectionPositions(collectionId: string): Promise<Map<string, number>> {
  const { data, error } = await createServerSupabaseClient().schema("store").from("collection_products").select("product_id, position").eq("collection_id", collectionId);
  if (error) throw new Error(error.message);
  return new Map((data || []).map((m) => [m.product_id as string, Number(m.position) || 0]));
}

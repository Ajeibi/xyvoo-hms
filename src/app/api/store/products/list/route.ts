import { NextResponse } from "next/server";
import { resolveStoreRequest } from "@/lib/store/api-helpers";
import { getStorePlan, storeHasFeature } from "@/lib/store/features";
import { mapProductRowToDashboard, type StoreProductRow } from "@/lib/store/products";
import {
  MAX_BULK_PRODUCTS,
  PRODUCTS_PAGE_SIZE,
  PRODUCT_SORTS,
  STOCK_FILTERS,
  buildSearchFilter,
  cleanSearchTerm,
  pageRange,
  parseProductListQuery,
} from "@/lib/store/product-catalogue";

const LOAD_FAILED = "We couldn't load your products just now. Please refresh the page.";

/**
 * GET /api/store/products/list?slug=
 *
 * Without `page`: every product, newest first, as `{ products }` (the Home
 * page, discounts and free delivery rules rely on this). Filters still apply
 * if given.
 *
 * With `page`: one page of 25 for the Products screen, as `{ products, total,
 * page, pageSize, pageCount, categories, canExport }`. Optional: q (name, SKU,
 * category, tag, or an option's SKU), status, stock (in-stock, low-stock,
 * out-of-stock), category, collection (id) and sort.
 *
 * With `fields=slugs`: just the web links in use, `{ slugs }`, so a new
 * product can be given one that doesn't clash.
 *
 * With `fields=ids`: the ids of the products matching the filters, up to the
 * bulk-action limit, `{ ids }`, for "select all matching products".
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const resolved = await resolveStoreRequest(searchParams.get("slug") || "");
  if (resolved.error) return resolved.error;
  const { service, access } = resolved;
  const tenantId = access.tenantId;
  const store = service.schema("store");

  if (searchParams.get("fields") === "slugs") {
    const { data, error } = await store.from("products").select("slug").eq("tenant_id", tenantId).not("slug", "is", null);
    if (error) {
      console.error("Products list: slugs failed", error);
      return NextResponse.json({ error: LOAD_FAILED }, { status: 500 });
    }
    return NextResponse.json({ slugs: (data || []).map((r) => r.slug as string) });
  }

  const query = parseProductListQuery(searchParams);
  const paged = query.page !== undefined;

  // Products whose options match the search by stock code. Variants have no tenant column, so join to the product's.
  let variantMatches: string[] = [];
  const term = query.q ? cleanSearchTerm(query.q) : "";
  if (term) {
    const { data } = await store
      .from("product_variants")
      .select("product_id, products!inner(tenant_id)")
      .eq("products.tenant_id", tenantId)
      .or(`sku.ilike.%${term}%,barcode.eq.${term}`)
      .limit(200);
    variantMatches = [...new Set((data || []).map((r) => r.product_id as string))];
  }

  // A collection filter: only products in that collection, and only if the collection is this store's.
  let collectionIds: string[] | null = null;
  if (query.collection) {
    const { data: collection } = await store.from("collections").select("id").eq("id", query.collection).eq("tenant_id", tenantId).maybeSingle();
    if (collection) {
      const { data } = await store.from("collection_products").select("product_id").eq("collection_id", collection.id);
      collectionIds = (data || []).map((r) => r.product_id as string);
    } else {
      collectionIds = [];
    }
  }

  const sort = PRODUCT_SORTS[query.sort];
  const idsOnly = searchParams.get("fields") === "ids";
  const search = term ? buildSearchFilter(term, variantMatches) : null;
  /** The search and filters, on any query of this shop's products. */
  // Typed loosely on purpose: Supabase's query types nest too deeply for a generic here.
  const filtered = <Q,>(query_: Q): Q => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let q = query_ as any;
    if (search) q = q.or(search);
    if (query.status) q = q.eq("status", query.status);
    if (query.category) q = q.eq("category", query.category);
    if (query.stock) q = q.eq("stock_state", STOCK_FILTERS[query.stock]);
    // An empty collection matches nothing; PostgREST needs at least one value in an `in` list.
    if (collectionIds) q = q.in("id", collectionIds.length ? collectionIds : ["00000000-0000-0000-0000-000000000000"]);
    return q as Q;
  };
  let request = filtered(
    store
      .from("products")
      .select(idsOnly ? "id" : "*, product_variants(*)", paged && !idsOnly ? { count: "exact" } : undefined)
      .eq("tenant_id", tenantId),
  );
  request = request.order(sort.column, { ascending: sort.ascending }).order("id", { ascending: true });
  if (idsOnly) {
    const { data, error } = await request.limit(MAX_BULK_PRODUCTS);
    if (error) {
      console.error("Products list: ids failed", error);
      return NextResponse.json({ error: LOAD_FAILED }, { status: 500 });
    }
    return NextResponse.json({ ids: ((data || []) as unknown as Array<{ id: string }>).map((r) => r.id) });
  }
  if (paged) {
    const { from, to } = pageRange(query.page!);
    request = request.range(from, to);
  }

  const { data, error, count } = await request;
  if (error) {
    // Asking for a page past the end (after deleting the last products on it) isn't an error worth showing.
    // Say how many there really are, so the page can step back to the last page.
    if (paged && error.code === "PGRST103") {
      const { count: total } = await filtered(store.from("products").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId));
      const realTotal = total ?? 0;
      return NextResponse.json({ products: [], total: realTotal, page: query.page, pageSize: PRODUCTS_PAGE_SIZE, pageCount: Math.ceil(realTotal / PRODUCTS_PAGE_SIZE), categories: [] });
    }
    console.error("Products list failed", error);
    return NextResponse.json({ error: LOAD_FAILED }, { status: 500 });
  }

  const products = ((data || []) as unknown as StoreProductRow[]).map(mapProductRowToDashboard);
  if (!paged) return NextResponse.json({ products });

  // For the category filter: every category the shop uses.
  const [{ data: categoryRows }, plan] = await Promise.all([
    store.from("products").select("category").eq("tenant_id", tenantId).not("category", "is", null),
    getStorePlan(tenantId),
  ]);
  const categories = [...new Set((categoryRows || []).map((r) => String(r.category).trim()).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, "en-GB", { sensitivity: "base" }),
  );

  const total = count ?? products.length;
  return NextResponse.json({
    products,
    total,
    page: query.page,
    pageSize: PRODUCTS_PAGE_SIZE,
    pageCount: Math.max(1, Math.ceil(total / PRODUCTS_PAGE_SIZE)),
    categories,
    canExport: storeHasFeature(plan, "exports"),
  });
}

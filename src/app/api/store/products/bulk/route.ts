import { after, NextResponse } from "next/server";
import { resolveStoreRequest, storeOwnsProducts } from "@/lib/store/api-helpers";
import { bulkRequestSchema, describeBulkResult, groupByNewPrice } from "@/lib/store/product-catalogue";
import { logActivity } from "@/lib/store/activity";
import { sendStockAlertsForProducts } from "@/lib/store/stock-alerts";

const SAVE_FAILED = "We couldn't make that change just now. Please try again.";

/**
 * POST /api/store/products/bulk { slug, ids: [...], action }
 *
 * One change to many products: price (set, or up/down by a percentage or an
 * amount), stock, status, category, add to or remove from a collection, or
 * delete. Up to 200 products at a time, and every one must be this store's.
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = bulkRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message || "Please check the change and try again." }, { status: 400 });
  }
  const { ids, action } = parsed.data;

  const resolved = await resolveStoreRequest(parsed.data.slug);
  if (resolved.error) return resolved.error;
  const { service, access, capabilities } = resolved;
  const tenantId = access.tenantId;

  if (action.type === "delete" ? !capabilities.canDeleteProducts : !capabilities.canManageProducts) {
    return NextResponse.json(
      { error: action.type === "delete" ? "Only an owner or admin can delete products." : "You can't change products." },
      { status: 403 },
    );
  }

  // The same answer whether a product is another store's or doesn't exist.
  if (!(await storeOwnsProducts(service, tenantId, ids))) {
    return NextResponse.json({ error: "Some of those products couldn't be found. Please refresh the page and try again." }, { status: 404 });
  }

  const store = service.schema("store");
  const products = () => store.from("products");

  // What each product looked like before, so the activity log can say "from what, to what".
  const { data: beforeRows } = await products().select("id, name, price, stock, status, category").eq("tenant_id", tenantId).in("id", ids);
  const before = new Map((beforeRows || []).map((r) => [r.id as string, r as { id: string; name: string } & Record<string, unknown>]));
  const logEach = async (entries: { id: string; action: string; changes?: Record<string, { from: unknown; to: unknown }> }[]) => {
    for (let i = 0; i < entries.length; i += 20) {
      await Promise.all(
        entries.slice(i, i + 20).map((e) =>
          logActivity({ tenantId, actor: access, area: "products", action: e.action, targetId: e.id, targetLabel: before.get(e.id)?.name ?? null, changes: e.changes }),
        ),
      );
    }
  };
  let activity: Parameters<typeof logEach>[0] = [];
  const audit = (changed: Record<string, unknown>) =>
    store.from("product_audit_log").insert(ids.map((id) => ({ tenant_id: tenantId, product_id: id, user_id: access.userId, changed_fields: { ...changed, bulk: true } })));

  try {
    switch (action.type) {
      case "price": {
        const { data, error } = await products().select("id, price").eq("tenant_id", tenantId).in("id", ids);
        if (error) throw error;
        const groups = groupByNewPrice((data || []).map((p) => ({ id: p.id as string, price: Number(p.price) })), action);
        // One update per distinct new price, a few at a time.
        const entries = [...groups];
        for (let i = 0; i < entries.length; i += 10) {
          const results = await Promise.all(
            entries.slice(i, i + 10).map(([price, groupIds]) => products().update({ price }).eq("tenant_id", tenantId).in("id", groupIds)),
          );
          const failed = results.find((r) => r.error);
          if (failed?.error) throw failed.error;
        }
        await store
          .from("product_audit_log")
          .insert([...groups].flatMap(([price, groupIds]) => groupIds.map((id) => ({ tenant_id: tenantId, product_id: id, user_id: access.userId, changed_fields: { price, bulk: true } }))));
        activity = [...groups].flatMap(([price, groupIds]) =>
          groupIds.map((id) => ({ id, action: "updated", changes: { price: { from: Number(before.get(id)?.price), to: price } } })),
        );
        break;
      }
      case "stock":
      case "status":
      case "category": {
        const column = action.type;
        const { error } = await products().update({ [column]: action.value }).eq("tenant_id", tenantId).in("id", ids);
        if (error) throw error;
        await audit({ [column]: action.value });
        activity = ids.map((id) => ({ id, action: "updated", changes: { [column]: { from: before.get(id)?.[column] ?? null, to: action.value } } }));
        break;
      }
      case "collection": {
        const { data: collection } = await store.from("collections").select("id").eq("id", action.collectionId).eq("tenant_id", tenantId).maybeSingle();
        if (!collection) return NextResponse.json({ error: "That collection couldn't be found. Please refresh the page and try again." }, { status: 404 });
        if (action.op === "add") {
          const { data: existing, error: readError } = await store.from("collection_products").select("product_id, position").eq("collection_id", collection.id);
          if (readError) throw readError;
          const already = new Set((existing || []).map((r) => r.product_id as string));
          let position = Math.max(-1, ...(existing || []).map((r) => Number(r.position) || 0));
          const rows = ids.filter((id) => !already.has(id)).map((product_id) => ({ collection_id: collection.id, product_id, position: ++position }));
          if (rows.length) {
            const { error } = await store.from("collection_products").insert(rows);
            if (error) throw error;
          }
        } else {
          const { error } = await store.from("collection_products").delete().eq("collection_id", collection.id).in("product_id", ids);
          if (error) throw error;
        }
        activity = ids.map((id) => ({ id, action: action.op === "add" ? "added_to_collection" : "removed_from_collection" }));
        break;
      }
      case "delete": {
        const { error } = await products().delete().eq("tenant_id", tenantId).in("id", ids);
        if (error) throw error;
        activity = ids.map((id) => ({ id, action: "deleted" }));
        break;
      }
    }
  } catch (err) {
    console.error("Products bulk action failed", action.type, err);
    return NextResponse.json({ error: SAVE_FAILED }, { status: 500 });
  }

  await logEach(activity);
  // A stock or status change may have brought products back: tell anyone who asked.
  after(() => sendStockAlertsForProducts(resolved.access.tenantId, ids));
  return NextResponse.json({ updated: ids.length, message: describeBulkResult(action, ids.length) });
}

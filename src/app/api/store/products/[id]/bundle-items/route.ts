import { NextResponse } from "next/server";
import { z } from "zod";
import { productNotFound, resolveStoreRequest, storeOwnsProducts } from "@/lib/store/api-helpers";

/*
 * What's in a bundle (store.product_bundle_items). The bundle's stock is
 * worked out from its items by the database (see the bundle stock migration),
 * so items must be simple products: no sizes or colours, and not bundles
 * themselves. A bundle can't have sizes or colours either.
 */

const ITEM_COLUMNS = "id, component_product_id, quantity, component:component_product_id(id, name, sku, image_url, price, stock, allow_backorder)";

const cannotEdit = () => NextResponse.json({ error: "You don't have permission to change products." }, { status: 403 });

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const result = await resolveStoreRequest(searchParams.get("slug") || "");
  if (result.error) return result.error;
  if (!(await storeOwnsProducts(result.service, result.access.tenantId, [id]))) return productNotFound();

  const { data, error } = await result.service.schema("store").from("product_bundle_items").select(ITEM_COLUMNS).eq("bundle_product_id", id).order("created_at");
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ items: data || [] });
}

const AddSchema = z.object({ slug: z.string(), component_product_id: z.string().uuid(), quantity: z.number().int().min(1).max(100).default(1) });

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsed = AddSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Choose a product and how many go in the bundle." }, { status: 400 });
  const result = await resolveStoreRequest(parsed.data.slug);
  if (result.error) return result.error;
  if (!result.capabilities.canManageProducts) return cannotEdit();
  const componentId = parsed.data.component_product_id;
  if (componentId === id) return NextResponse.json({ error: "A bundle can't contain itself." }, { status: 400 });
  // The bundle and its item must both be this store's.
  if (!(await storeOwnsProducts(result.service, result.access.tenantId, [id, componentId]))) return productNotFound();

  const db = result.service.schema("store");
  const [{ data: variants }, { data: componentIsBundle }, { data: bundleIsItem }] = await Promise.all([
    db.from("product_variants").select("product_id").in("product_id", [id, componentId]).is("archived_at", null),
    db.from("product_bundle_items").select("id").eq("bundle_product_id", componentId).limit(1),
    db.from("product_bundle_items").select("id").eq("component_product_id", id).limit(1),
  ]);
  const withOptions = new Set((variants || []).map((v) => v.product_id as string));
  if (withOptions.has(id)) return NextResponse.json({ error: "A bundle can't have sizes or colours. Remove its options first." }, { status: 400 });
  if (withOptions.has(componentId))
    return NextResponse.json({ error: "Products with sizes or colours can't go in a bundle yet. Choose a product without options." }, { status: 400 });
  if (componentIsBundle?.length) return NextResponse.json({ error: "A bundle can't go inside another bundle." }, { status: 400 });
  if (bundleIsItem?.length) return NextResponse.json({ error: "This product is part of another bundle, so it can't be a bundle itself." }, { status: 400 });

  const { data, error } = await db
    .from("product_bundle_items")
    .upsert({ bundle_product_id: id, component_product_id: componentId, quantity: parsed.data.quantity }, { onConflict: "bundle_product_id,component_product_id" })
    .select(ITEM_COLUMNS)
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ item: data }, { status: 201 });
}

const PatchSchema = z.object({ slug: z.string(), itemId: z.string().uuid(), quantity: z.number().int().min(1).max(100) });

/** PATCH { slug, itemId, quantity } — how many of an item go in each bundle. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsed = PatchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter how many go in each bundle (1 to 100)." }, { status: 400 });
  const result = await resolveStoreRequest(parsed.data.slug);
  if (result.error) return result.error;
  if (!result.capabilities.canManageProducts) return cannotEdit();
  if (!(await storeOwnsProducts(result.service, result.access.tenantId, [id]))) return productNotFound();

  const { error } = await result.service
    .schema("store")
    .from("product_bundle_items")
    .update({ quantity: parsed.data.quantity })
    .eq("id", parsed.data.itemId)
    .eq("bundle_product_id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const itemId = searchParams.get("itemId") || "";
  const result = await resolveStoreRequest(searchParams.get("slug") || "");
  if (result.error) return result.error;
  if (!result.capabilities.canManageProducts) return cannotEdit();
  if (!itemId) return NextResponse.json({ error: "Missing itemId." }, { status: 400 });
  if (!(await storeOwnsProducts(result.service, result.access.tenantId, [id]))) return productNotFound();

  const { error } = await result.service.schema("store").from("product_bundle_items").delete().eq("id", itemId).eq("bundle_product_id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ success: true });
}

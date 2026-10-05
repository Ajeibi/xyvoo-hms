import { NextResponse } from "next/server";
import { resolveStoreRequest } from "@/lib/store/api-helpers";
import { collectionSchema, setCollectionProducts, toCollectionRow, type CollectionSummary } from "@/lib/store/collections";

/** GET /api/store/collections?slug= — every collection with its products, in order. */
export async function GET(req: Request) {
  const resolved = await resolveStoreRequest(new URL(req.url).searchParams.get("slug") || "");
  if (resolved.error) return resolved.error;

  const { data, error } = await resolved.service
    .schema("store")
    .from("collections")
    .select("id, name, slug, description, image_url, image_alt, is_visible, collection_products(product_id, position)")
    .eq("tenant_id", resolved.access.tenantId)
    .order("sort_order")
    .order("created_at");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const collections: CollectionSummary[] = (data || []).map((c) => ({
    id: c.id,
    name: c.name,
    slug: c.slug,
    description: c.description ?? "",
    imageUrl: c.image_url,
    imageAlt: c.image_alt ?? "",
    isVisible: c.is_visible,
    productIds: [...((c.collection_products as Array<{ product_id: string; position: number }>) || [])]
      .sort((a, b) => a.position - b.position)
      .map((p) => p.product_id),
  }));
  return NextResponse.json({ collections, canManage: resolved.capabilities.canManageProducts });
}

/** POST /api/store/collections { slug, ...collection } */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const resolved = await resolveStoreRequest(typeof body?.slug === "string" ? body.slug : "");
  if (resolved.error) return resolved.error;
  if (!resolved.capabilities.canManageProducts) return NextResponse.json({ error: "You can't change collections." }, { status: 403 });

  const parsed = collectionSchema.safeParse({ ...body, slug: body?.collectionSlug });
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "Check the details." }, { status: 400 });

  const store = resolved.service.schema("store");
  const { count } = await store.from("collections").select("id", { count: "exact", head: true }).eq("tenant_id", resolved.access.tenantId);
  const { data, error } = await store
    .from("collections")
    .insert({ tenant_id: resolved.access.tenantId, sort_order: count ?? 0, ...toCollectionRow(parsed.data) })
    .select("id")
    .single();
  if (error) {
    const taken = error.code === "23505";
    return NextResponse.json({ error: taken ? "Another collection already uses that web address." : error.message }, { status: taken ? 409 : 500 });
  }

  try {
    await setCollectionProducts(resolved.service, resolved.access.tenantId, data.id, parsed.data.productIds);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
  return NextResponse.json({ id: data.id }, { status: 201 });
}

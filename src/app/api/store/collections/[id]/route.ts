import { NextResponse } from "next/server";
import { resolveStoreRequest } from "@/lib/store/api-helpers";
import { collectionSchema, setCollectionProducts, toCollectionRow } from "@/lib/store/collections";

async function authorise(slug: unknown) {
  const resolved = await resolveStoreRequest(typeof slug === "string" ? slug : "");
  if (resolved.error) return resolved;
  if (!resolved.capabilities.canManageProducts) return { error: NextResponse.json({ error: "You can't change collections." }, { status: 403 }) };
  return resolved;
}

/** PATCH /api/store/collections/<id> { slug, collectionSlug, ...collection } */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const body = await req.json().catch(() => null);
  const resolved = await authorise(body?.slug);
  if (resolved.error) return resolved.error;

  const parsed = collectionSchema.safeParse({ ...body, slug: body?.collectionSlug });
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "Check the details." }, { status: 400 });

  const id = (await params).id;
  const { data, error } = await resolved.service
    .schema("store")
    .from("collections")
    .update(toCollectionRow(parsed.data))
    .eq("id", id)
    .eq("tenant_id", resolved.access.tenantId)
    .select("id")
    .maybeSingle();
  if (error) {
    const taken = error.code === "23505";
    return NextResponse.json({ error: taken ? "Another collection already uses that web address." : error.message }, { status: taken ? 409 : 500 });
  }
  if (!data) return NextResponse.json({ error: "Collection not found." }, { status: 404 });

  try {
    await setCollectionProducts(resolved.service, resolved.access.tenantId, id, parsed.data.productIds);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

/** DELETE /api/store/collections/<id>?slug= — the products themselves are untouched. */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const resolved = await authorise(new URL(req.url).searchParams.get("slug"));
  if (resolved.error) return resolved.error;
  const { error } = await resolved.service.schema("store").from("collections").delete().eq("id", (await params).id).eq("tenant_id", resolved.access.tenantId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

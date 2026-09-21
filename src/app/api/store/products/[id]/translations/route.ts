import { NextResponse } from "next/server";
import { resolveStoreRequest } from "@/lib/store/api-helpers";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const result = await resolveStoreRequest(searchParams.get("slug") || "");
  if (result.error) return result.error;

  const { data, error } = await result.service
    .schema("store")
    .from("product_translations")
    .select("*")
    .eq("product_id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ translations: data || [] });
}

/** Upsert by (product_id, locale) so re-saving a locale just updates it. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const result = await resolveStoreRequest(body?.slug || "");
  if (result.error) return result.error;

  if (!body?.locale) return NextResponse.json({ error: "locale is required." }, { status: 400 });

  const { data, error } = await result.service
    .schema("store")
    .from("product_translations")
    .upsert(
      {
        product_id: id,
        locale: body.locale,
        name: body.name || null,
        description: body.description || null,
        short_description: body.short_description || null,
        meta_title: body.meta_title || null,
        meta_description: body.meta_description || null,
      },
      { onConflict: "product_id,locale" },
    )
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ translation: data }, { status: 201 });
}

export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url);
  const itemId = searchParams.get("itemId") || "";
  const result = await resolveStoreRequest(searchParams.get("slug") || "");
  if (result.error) return result.error;
  if (!itemId) return NextResponse.json({ error: "Missing itemId." }, { status: 400 });

  const { error } = await result.service.schema("store").from("product_translations").delete().eq("id", itemId);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ success: true });
}

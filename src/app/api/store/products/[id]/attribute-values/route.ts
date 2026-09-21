import { NextResponse } from "next/server";
import { resolveStoreRequest } from "@/lib/store/api-helpers";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const result = await resolveStoreRequest(searchParams.get("slug") || "");
  if (result.error) return result.error;

  const { data, error } = await result.service
    .schema("store")
    .from("product_attribute_values")
    .select("id, value, attribute:attribute_id(id, name)")
    .eq("product_id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ values: data || [] });
}

/** Upsert by (product_id, attribute_id) so re-setting a value just updates it. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const result = await resolveStoreRequest(body?.slug || "");
  if (result.error) return result.error;

  if (!body?.attribute_id || !body?.value) {
    return NextResponse.json({ error: "attribute_id and value are required." }, { status: 400 });
  }

  const { data, error } = await result.service
    .schema("store")
    .from("product_attribute_values")
    .upsert(
      { product_id: id, attribute_id: body.attribute_id, value: body.value },
      { onConflict: "product_id,attribute_id" },
    )
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ value: data }, { status: 201 });
}

export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url);
  const itemId = searchParams.get("itemId") || "";
  const result = await resolveStoreRequest(searchParams.get("slug") || "");
  if (result.error) return result.error;
  if (!itemId) return NextResponse.json({ error: "Missing itemId." }, { status: 400 });

  const { error } = await result.service.schema("store").from("product_attribute_values").delete().eq("id", itemId);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ success: true });
}

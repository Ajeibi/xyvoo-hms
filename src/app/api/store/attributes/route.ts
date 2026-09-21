import { NextResponse } from "next/server";
import { resolveStoreRequest } from "@/lib/store/api-helpers";

/** Tenant-level custom filter attribute definitions (e.g. "Material", "Fit"). */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const result = await resolveStoreRequest(searchParams.get("slug") || "");
  if (result.error) return result.error;

  const { data, error } = await result.service
    .schema("store")
    .from("product_attributes")
    .select("*")
    .eq("tenant_id", result.access.tenantId)
    .order("name");

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ attributes: data || [] });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const result = await resolveStoreRequest(body?.slug || "");
  if (result.error) return result.error;
  if (!result.capabilities.canManageAttributes) {
    return NextResponse.json({ error: "Only an owner or admin can manage attributes." }, { status: 403 });
  }

  if (!body?.name) return NextResponse.json({ error: "name is required." }, { status: 400 });

  const { data, error } = await result.service
    .schema("store")
    .from("product_attributes")
    .insert({ tenant_id: result.access.tenantId, name: body.name })
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ attribute: data }, { status: 201 });
}

export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url);
  const itemId = searchParams.get("itemId") || "";
  const result = await resolveStoreRequest(searchParams.get("slug") || "");
  if (result.error) return result.error;
  if (!result.capabilities.canManageAttributes) {
    return NextResponse.json({ error: "Only an owner or admin can manage attributes." }, { status: 403 });
  }
  if (!itemId) return NextResponse.json({ error: "Missing itemId." }, { status: 400 });

  const { error } = await result.service
    .schema("store")
    .from("product_attributes")
    .delete()
    .eq("id", itemId)
    .eq("tenant_id", result.access.tenantId);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ success: true });
}

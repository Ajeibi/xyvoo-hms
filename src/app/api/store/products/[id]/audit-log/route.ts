import { NextResponse } from "next/server";
import { productNotFound, resolveStoreRequest, storeOwnsProducts } from "@/lib/store/api-helpers";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const result = await resolveStoreRequest(searchParams.get("slug") || "");
  if (result.error) return result.error;
  if (!(await storeOwnsProducts(result.service, result.access.tenantId, [id]))) return productNotFound();

  const { data, error } = await result.service
    .schema("store")
    .from("product_audit_log")
    .select("*")
    .eq("product_id", id)
    .order("changed_at", { ascending: false })
    .limit(100);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ entries: data || [] });
}

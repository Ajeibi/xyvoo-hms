import { NextResponse } from "next/server";
import { resolveStoreRequest } from "@/lib/store/api-helpers";
import { featureUnavailable } from "@/lib/store/features";
import { catalogueToCsv, type ExportProduct } from "@/lib/store/product-import";

/**
 * GET /api/store/products/export?slug= — the whole catalogue as CSV, in the
 * same layout the import reads, so a merchant can export, edit and import it
 * back. Part of the Standard plan.
 */
export async function GET(req: Request) {
  const slug = new URL(req.url).searchParams.get("slug") || "";
  const resolved = await resolveStoreRequest(slug);
  if (resolved.error) return resolved.error;
  const { access, service } = resolved;
  const blocked = await featureUnavailable(access.tenantId, "exports");
  if (blocked) return blocked;

  const { data, error } = await service
    .schema("store")
    .from("products")
    .select(
      "name, sku, slug, price, compare_at_price, cost_price, stock, category, brand, tags, status, description, image_url, created_at, product_variants(id, options, sku, price_override, stock, image_url, barcode, weight_kg, archived_at, created_at)",
    )
    .eq("tenant_id", access.tenantId)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });
  if (error) {
    console.error("Products export failed", error);
    return NextResponse.json({ error: "We couldn't prepare your products just now. Please try again." }, { status: 500 });
  }

  const products = ((data || []) as Array<ExportProduct & { product_variants?: Array<{ created_at?: string }> }>).map((p) => ({
    ...p,
    product_variants: [...(p.product_variants || [])].sort((a, b) => String(a.created_at ?? "").localeCompare(String(b.created_at ?? ""))),
  })) as ExportProduct[];

  const date = new Date().toISOString().slice(0, 10);
  const safeSlug = slug.replace(/[^a-z0-9-]/gi, "") || "shop";
  return new Response(`﻿${catalogueToCsv(products)}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${safeSlug}-products-${date}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}

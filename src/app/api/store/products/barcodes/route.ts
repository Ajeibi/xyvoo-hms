import { NextResponse } from "next/server";
import { resolveStoreRequest } from "@/lib/store/api-helpers";

type VariantRow = { options: Record<string, string> | null; barcode: string | null; price_override: number | string | null; archived_at: string | null };

/** GET /api/store/products/barcodes?slug= — every product and option that has a barcode, for printing labels. */
export async function GET(req: Request) {
  const resolved = await resolveStoreRequest(new URL(req.url).searchParams.get("slug") || "");
  if (resolved.error) return resolved.error;
  const tenantId = resolved.access.tenantId;
  const store = resolved.service.schema("store");
  const [{ data, error }, { data: profile }] = await Promise.all([
    store.from("products").select("id, name, price, barcode, status, product_variants(options, barcode, price_override, archived_at)").eq("tenant_id", tenantId).neq("status", "archived").order("name").limit(2000),
    store.from("business_profile").select("currency_code").eq("tenant_id", tenantId).maybeSingle(),
  ]);
  if (error) {
    console.error("[barcodes] load failed", error);
    return NextResponse.json({ error: "We couldn't load your products just now." }, { status: 500 });
  }
  const labels = (data || []).flatMap((p) => {
    const base = Number(p.price) || 0;
    const items: { key: string; name: string; option: string | null; barcode: string; price: number }[] = [];
    if (p.barcode) items.push({ key: p.id as string, name: p.name as string, option: null, barcode: String(p.barcode), price: base });
    for (const v of (p.product_variants || []) as VariantRow[]) {
      if (v.archived_at || !v.barcode) continue;
      const option = Object.values(v.options || {}).join(" · ") || null;
      items.push({ key: `${p.id}:${v.barcode}`, name: p.name as string, option, barcode: String(v.barcode), price: v.price_override != null ? Number(v.price_override) : base });
    }
    return items;
  });
  return NextResponse.json({ labels, currency: profile?.currency_code || "NGN" });
}

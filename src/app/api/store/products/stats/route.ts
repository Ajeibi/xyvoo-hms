import { NextResponse } from "next/server";
import { resolveStoreRequest } from "@/lib/store/api-helpers";

/**
 * GET /api/store/products/stats?slug= — the figures at the top of the Products page:
 * how many products, what the stock on hand would sell for and what it cost,
 * and how many have sold out or are running low. Archived products are left out.
 */
export async function GET(req: Request) {
  const resolved = await resolveStoreRequest(new URL(req.url).searchParams.get("slug") || "");
  if (resolved.error) return resolved.error;
  const { data, error } = await resolved.service
    .schema("store")
    .from("products")
    .select("price, cost_price, stock, stock_state, status")
    .eq("tenant_id", resolved.access.tenantId)
    .neq("status", "archived")
    .limit(20000);
  if (error) {
    console.error("[products stats] failed", error);
    return NextResponse.json({ error: "We couldn't work out your stock figures." }, { status: 500 });
  }
  let retailValue = 0;
  let costValue = 0;
  let soldOut = 0;
  let low = 0;
  for (const p of data || []) {
    const stock = Math.max(0, Number(p.stock) || 0);
    retailValue += stock * (Number(p.price) || 0);
    costValue += stock * (Number(p.cost_price) || 0);
    if (p.stock_state === "out") soldOut += 1;
    else if (p.stock_state === "low") low += 1;
  }
  return NextResponse.json({ products: (data || []).length, retailValue, costValue, soldOut, low }, { headers: { "Cache-Control": "no-store" } });
}

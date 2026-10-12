import { NextResponse } from "next/server";
import { resolveStoreRequest } from "@/lib/store/api-helpers";
import { featureUnavailable } from "@/lib/store/features";
import { ORDERS_PAGE_SIZE, ordersToCsv, parseOrderListQuery } from "@/lib/store/order-list";
import { countAttention, listOrdersForExport, listOrdersPage } from "@/lib/store/order-list-server";
import { storeCurrency } from "@/lib/store/payout-routes";
import { releaseExpiredOrders } from "@/lib/store/release-orders";

/**
 * GET /api/store/orders/list?slug=&show=&status=&payment=&q=&from=&to=&page=
 * One page of 25 orders, newest first, with the quick-view counts.
 * Add format=csv for every matching order as a spreadsheet (Standard plan).
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const resolved = await resolveStoreRequest(searchParams.get("slug") || "");
  if (resolved.error) return resolved.error;
  const { tenantId } = resolved.access;
  const query = parseOrderListQuery(searchParams);

  if (searchParams.get("format") === "csv") {
    const blocked = await featureUnavailable(tenantId, "exports");
    if (blocked) return blocked;
    try {
      const orders = await listOrdersForExport(tenantId, query, await storeCurrency(tenantId, resolved.service));
      const day = new Date().toISOString().slice(0, 10);
      return new NextResponse(ordersToCsv(orders), {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="orders-${day}.csv"`,
          "Cache-Control": "no-store",
        },
      });
    } catch (error) {
      console.error("[orders export] failed", error);
      return NextResponse.json({ error: "We couldn't prepare your download. Please try again." }, { status: 500 });
    }
  }

  // Expired and failed card orders are shown as cancelled, with their stock back.
  await releaseExpiredOrders(tenantId).catch(() => 0);

  try {
    const currency = await storeCurrency(tenantId, resolved.service);
    const [page, counts] = await Promise.all([listOrdersPage(tenantId, query, currency), countAttention(tenantId)]);
    return NextResponse.json(
      { orders: page.orders, total: page.total, page: query.page, pageSize: ORDERS_PAGE_SIZE, counts, currency },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("[orders list] failed", error);
    return NextResponse.json({ error: "We couldn't load your orders. Please refresh the page." }, { status: 500 });
  }
}

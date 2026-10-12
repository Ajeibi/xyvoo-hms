import { NextResponse } from "next/server";
import { getAnalyticsDetail, storeTimezone, windowsFromParams } from "@/lib/store/analytics";
import { dailyCsv, loadSales, renderAnalyticsPdf, salesCsv } from "@/lib/store/analytics-export";
import { resolveStoreRequest } from "@/lib/store/api-helpers";
import { featureUnavailable } from "@/lib/store/features";
import { fileSlug } from "@/lib/store/receipts-format";
import { pdfBody } from "@/lib/store/receipts-pdf";

const FORMATS = ["sales-csv", "daily-csv", "pdf"] as const;
type Format = (typeof FORMATS)[number];

/**
 * GET /api/store/analytics/export?slug=&format=sales-csv|daily-csv|pdf
 * with &range=today|7d|28d or &from=YYYY-MM-DD&to=YYYY-MM-DD — a download of
 * the period's sales (one row per order), daily totals, or a PDF summary.
 * Any team member who can see analytics; Standard plan only.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const resolved = await resolveStoreRequest(url.searchParams.get("slug") || "");
  if (resolved.error) return resolved.error;
  // Sales figures are for the owner and admins, not staff.
  if (!resolved.capabilities.canViewReports) return NextResponse.json({ error: "Only the owner or an admin can see reports." }, { status: 403 });
  const { access, service } = resolved;

  const blocked = (await featureUnavailable(access.tenantId, "analytics")) || (await featureUnavailable(access.tenantId, "exports"));
  if (blocked) return blocked;

  const format = url.searchParams.get("format") as Format | null;
  if (!format || !FORMATS.includes(format)) return NextResponse.json({ error: "Choose which download you'd like." }, { status: 400 });

  const [{ data: profile }, { data: tenant }] = await Promise.all([
    service.schema("store").from("business_profile").select("country_code, currency_code").eq("tenant_id", access.tenantId).maybeSingle(),
    service.from("tenants").select("subdomain, name, display_name").eq("id", access.tenantId).maybeSingle(),
  ]);
  const timezone = storeTimezone(profile?.country_code);
  const currency = (profile?.currency_code as string | null) || "NGN";
  const storeName = (tenant?.display_name as string | null)?.trim() || String(tenant?.subdomain || tenant?.name || "Your shop");
  const windows = windowsFromParams(url.searchParams, timezone);
  if ("error" in windows) return NextResponse.json({ error: windows.error }, { status: 400 });
  const { from, to, fromDate, toDate } = windows;
  const name = `${fileSlug(storeName)}-${fromDate}-to-${toDate}`;

  try {
    if (format === "pdf") {
      const bytes = await renderAnalyticsPdf({ tenantId: access.tenantId, storeName, currency, timezone, from, to, fromDate, toDate });
      return download(pdfBody(bytes), "application/pdf", `${name}-sales-summary.pdf`);
    }
    if (format === "daily-csv") {
      const { daily } = await getAnalyticsDetail(access.tenantId, from, to, timezone);
      return download(dailyCsv(daily, currency), "text/csv; charset=utf-8", `${name}-daily-totals.csv`);
    }
    const sales = await loadSales(access.tenantId, from, to);
    return download(salesCsv(sales, currency, timezone), "text/csv; charset=utf-8", `${name}-sales.csv`);
  } catch (error) {
    console.error("[analytics export] failed", error);
    return NextResponse.json({ error: "We couldn't prepare your download just now. Please try again." }, { status: 500 });
  }
}

function download(body: BodyInit, type: string, filename: string) {
  return new Response(body, { headers: { "Content-Type": type, "Content-Disposition": `attachment; filename="${filename}"`, "Cache-Control": "private, no-store" } });
}

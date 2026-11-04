import { NextResponse } from "next/server";
import { requireHotelApiMember } from "@/lib/hms/hotel-api-auth";
import { getReportsCapabilities } from "@/lib/hms/reports-rbac";
import { normalizePricingSetup } from "@/lib/hms/room-pricing";
import { isIsoDate } from "@/lib/hms/reports/dates";
import { buildReportFile, REPORT_FILE_TYPES, reportFileName, type ReportFileFormat } from "@/lib/hms/reports/export";
import { buildReport, clampParams, defaultParams, getReportDef, makeReportContext } from "@/lib/hms/reports/library";

/** GET /api/hotel/reports/export?slug=&report=&format=xlsx|pdf|csv&date=&from=&to= */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const slug = url.searchParams.get("slug");
    const key = url.searchParams.get("report");
    const format = url.searchParams.get("format") as ReportFileFormat | null;
    if (!slug || !key || !format) return NextResponse.json({ error: "slug, report and format are required." }, { status: 400 });
    if (!(format in REPORT_FILE_TYPES)) return NextResponse.json({ error: "Pick Excel, PDF or CSV." }, { status: 400 });
    const def = getReportDef(key);
    if (!def) return NextResponse.json({ error: "That report does not exist." }, { status: 404 });

    const auth = await requireHotelApiMember(slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const caps = getReportsCapabilities({ membershipRole: auth.role, departmentRole: auth.departmentRole });
    if (!(def.audience === "finance" ? caps.canViewFinance : caps.canViewOperations)) return NextResponse.json({ error: "Your role can't run this report." }, { status: 403 });

    const currency = normalizePricingSetup(auth.tenant.pricing_setup).currency;
    const hotelName = auth.tenant.display_name?.trim() || auth.tenant.name?.trim() || slug;
    const ctx = await makeReportContext(auth.service, auth.tenant.id, currency, hotelName);
    const base = defaultParams(ctx.businessDate);
    const read = (name: string, fallback: string) => {
      const v = url.searchParams.get(name);
      return isIsoDate(v) ? v : fallback;
    };
    const params = clampParams({ date: read("date", base.date), from: read("from", base.from), to: read("to", base.to) });

    const document = await buildReport(def, ctx, params);
    const body = await buildReportFile(document, format, hotelName);
    const stamp = def.period === "day" ? params.date : def.period === "range" ? `${params.from}-to-${params.to}` : ctx.today;
    return new NextResponse(new Uint8Array(body), {
      headers: {
        "Content-Type": REPORT_FILE_TYPES[format].contentType,
        "Content-Disposition": `attachment; filename="${reportFileName(document, format, stamp)}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    console.error("[reports export GET]", e);
    return NextResponse.json({ error: "Failed to build the report." }, { status: 500 });
  }
}

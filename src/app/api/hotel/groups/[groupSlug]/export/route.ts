import { NextResponse } from "next/server";
import { requireGroupApi } from "@/lib/hms/groups/group-access";
import { buildGroupReport } from "@/lib/hms/groups/group-report-build";
import { isGroupReportKey } from "@/lib/hms/groups/group-reports";
import { isIsoDate } from "@/lib/hms/reports/dates";
import { buildReportFile, REPORT_FILE_TYPES, reportFileName, type ReportFileFormat } from "@/lib/hms/reports/export";

type Ctx = { params: Promise<{ groupSlug: string }> };

/** GET ?report=&from=&to=&format=xlsx|pdf|csv: a group report as a file (any group role). */
export async function GET(req: Request, { params }: Ctx) {
  const { groupSlug } = await params;
  const auth = await requireGroupApi(groupSlug);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const url = new URL(req.url);
  const report = url.searchParams.get("report");
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const format = (url.searchParams.get("format") ?? "xlsx") as ReportFileFormat;
  if (!isGroupReportKey(report) || !isIsoDate(from) || !isIsoDate(to) || from > to || !(format in REPORT_FILE_TYPES)) {
    return NextResponse.json({ error: "Choose a report, dates and a file type." }, { status: 400 });
  }
  try {
    const doc = await buildGroupReport(auth.ctx, report, from, to);
    const file = await buildReportFile(doc, format, auth.ctx.group.name);
    const type = REPORT_FILE_TYPES[format];
    return new NextResponse(new Uint8Array(file), {
      headers: {
        "Content-Type": type.contentType,
        "Content-Disposition": `attachment; filename="${reportFileName(doc, format, `${from}_${to}`)}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Couldn't build the report." }, { status: 400 });
  }
}

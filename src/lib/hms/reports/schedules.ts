import type { SupabaseClient } from "@supabase/supabase-js";
import { badge, EMAIL_SITE_URL } from "@/lib/mail/layout";
import { sendBrandedEmail } from "@/lib/mail/mailtrap";
import { buildReportFile, REPORT_FILE_TYPES, reportFileName } from "@/lib/hms/reports/export";
import { buildReport, getReportDef, makeReportContext } from "@/lib/hms/reports/library";
import { describeSchedule, schedulePeriod, type ReportSchedule } from "@/lib/hms/reports/schedule-rules";

/*
 * Sends one scheduled report: builds it for the period its frequency covers, makes the file and emails
 * it to each recipient. The rules for when a schedule is due live in schedule-rules.ts.
 */

export async function sendScheduledReport(
  service: SupabaseClient,
  schedule: ReportSchedule,
  tenant: { id: string; slug: string; currency: string; hotelName: string },
  now = new Date(),
): Promise<{ sent: number }> {
  const def = getReportDef(schedule.reportKey);
  if (!def) throw new Error("This report no longer exists.");
  const ctx = await makeReportContext(service, tenant.id, tenant.currency, tenant.hotelName, now);
  const params = schedulePeriod(def.key, schedule.frequency, ctx.today);
  const document = await buildReport(def, ctx, params);
  const body = await buildReportFile(document, schedule.fileFormat, tenant.hotelName);
  const stamp = def.period === "day" ? params.date : def.period === "range" ? `${params.from}-to-${params.to}` : ctx.today;
  const filename = reportFileName(document, schedule.fileFormat, stamp);
  const link = `${EMAIL_SITE_URL}/hms/${tenant.slug}/reports/${def.key}`;
  let sent = 0;
  for (const to of schedule.recipients) {
    await sendBrandedEmail({
      to,
      subject: `${tenant.hotelName}: ${document.title} · ${document.subtitle}`,
      text: `${document.title} for ${tenant.hotelName}, ${document.subtitle}, is attached.\n\nOpen it online: ${link}\n\nYou get this because it is scheduled under Reports, Scheduled emails.`,
      layout: {
        preheader: `${document.title}, ${document.subtitle}`,
        badges: [badge("Scheduled report", "blue")],
        title: document.title,
        intro: `${document.subtitle}. The report is attached as ${schedule.fileFormat === "pdf" ? "a PDF" : "an Excel file"}.`,
        buttons: [{ label: "Open the report", href: link }],
        footerNote: `You get this because it is scheduled under Reports, Scheduled emails (${describeSchedule(schedule).toLowerCase()}).`,
      },
      attachments: [{ filename, content: body, contentType: REPORT_FILE_TYPES[schedule.fileFormat].contentType }],
    });
    sent += 1;
  }
  return { sent };
}

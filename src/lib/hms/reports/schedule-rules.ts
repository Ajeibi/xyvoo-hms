import { addDays, hotelDate, monthStart } from "@/lib/hms/reports/dates";
import type { ReportParams } from "@/lib/hms/reports/library";

/*
 * When a scheduled report is due and what dates it covers. No server code in here, so the schedules
 * screen can use it too.
 */

export type ScheduleFrequency = "daily" | "weekly" | "monthly";

export type ReportSchedule = {
  id: string;
  tenantId: string;
  reportKey: string;
  frequency: ScheduleFrequency;
  sendHour: number;
  weekday: number | null;
  monthDay: number | null;
  fileFormat: "pdf" | "xlsx";
  recipients: string[];
  active: boolean;
  lastSentOn: string | null;
  lastSentAt: string | null;
  lastError: string | null;
};

export const SCHEDULE_COLUMNS = "id,tenant_id,report_key,frequency,send_hour,weekday,month_day,file_format,recipients,active,last_sent_on,last_sent_at,last_error";

export function mapSchedule(row: Record<string, unknown>): ReportSchedule {
  return {
    id: row.id as string,
    tenantId: row.tenant_id as string,
    reportKey: row.report_key as string,
    frequency: row.frequency as ScheduleFrequency,
    sendHour: Number(row.send_hour),
    weekday: row.weekday == null ? null : Number(row.weekday),
    monthDay: row.month_day == null ? null : Number(row.month_day),
    fileFormat: row.file_format as "pdf" | "xlsx",
    recipients: (row.recipients as string[]) ?? [],
    active: Boolean(row.active),
    lastSentOn: (row.last_sent_on as string | null) ?? null,
    lastSentAt: (row.last_sent_at as string | null) ?? null,
    lastError: (row.last_error as string | null) ?? null,
  };
}

function localHour(now: Date, timeZone: string): number {
  return Number(new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", hourCycle: "h23" }).format(now));
}

/** 1 = Monday ... 7 = Sunday for a YYYY-MM-DD date. */
export function isoWeekday(date: string): number {
  const d = new Date(`${date}T00:00:00Z`).getUTCDay();
  return d === 0 ? 7 : d;
}

/** Whether a schedule should go out now. */
export function scheduleDue(
  s: Pick<ReportSchedule, "frequency" | "sendHour" | "weekday" | "monthDay" | "lastSentOn" | "active">,
  now: Date,
  timeZone: string,
): boolean {
  if (!s.active) return false;
  const today = hotelDate(now, timeZone);
  if (s.lastSentOn === today) return false;
  if (localHour(now, timeZone) < s.sendHour) return false;
  if (s.frequency === "weekly") return isoWeekday(today) === (s.weekday ?? 1);
  if (s.frequency === "monthly") return Number(today.slice(8, 10)) === Math.min(s.monthDay ?? 1, 28);
  return true;
}

/** Reports about who is arriving or leaving today are most useful sent for today; the rest report on the day just finished. */
const TODAY_REPORTS = new Set(["arrivals", "departures"]);

/** The dates a scheduled send covers: yesterday for daily, the last 7 days for weekly, the last full month for monthly. */
export function schedulePeriod(reportKey: string, frequency: ScheduleFrequency, today: string): ReportParams {
  const yesterday = addDays(today, -1);
  const date = TODAY_REPORTS.has(reportKey) ? today : yesterday;
  if (frequency === "weekly") return { date, from: addDays(today, -7), to: yesterday };
  if (frequency === "monthly") {
    const prevMonthEnd = addDays(monthStart(today), -1);
    return { date: prevMonthEnd, from: monthStart(prevMonthEnd), to: prevMonthEnd };
  }
  return { date, from: yesterday, to: yesterday };
}

export function describeSchedule(s: Pick<ReportSchedule, "frequency" | "sendHour" | "weekday" | "monthDay">): string {
  const hour = `${String(s.sendHour).padStart(2, "0")}:00`;
  if (s.frequency === "weekly") {
    const names = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
    return `Every ${names[(s.weekday ?? 1) - 1]} at ${hour}`;
  }
  if (s.frequency === "monthly") return `On day ${Math.min(s.monthDay ?? 1, 28)} of each month at ${hour}`;
  return `Every day at ${hour}`;
}

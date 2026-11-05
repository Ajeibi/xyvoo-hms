"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, CalendarClock, Mail, Pause, Play, Send, Trash2 } from "lucide-react";
import { HmsCard, HmsEmptyState, HmsField, HmsPage, HmsPageHeader, hmsButton, hmsInput } from "@/components/hms/hms-ui";
import { describeSchedule, type ReportSchedule } from "@/lib/hms/reports/schedule-rules";

type Option = { key: string; title: string };

const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export function SchedulesClient({
  slug,
  reports,
  initial,
  defaultReport,
  defaultEmail,
}: {
  slug: string;
  reports: Option[];
  initial: ReportSchedule[];
  defaultReport: string;
  defaultEmail: string;
}) {
  const [schedules, setSchedules] = useState(initial);
  const [reportKey, setReportKey] = useState(reports.some((r) => r.key === defaultReport) ? defaultReport : (reports[0]?.key ?? ""));
  const [frequency, setFrequency] = useState<"daily" | "weekly" | "monthly">("daily");
  const [sendHour, setSendHour] = useState(6);
  const [weekday, setWeekday] = useState(1);
  const [monthDay, setMonthDay] = useState(1);
  const [fileFormat, setFileFormat] = useState<"pdf" | "xlsx">("pdf");
  const [recipients, setRecipients] = useState(defaultEmail);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  const titleOf = (key: string) => reports.find((r) => r.key === key)?.title ?? key;

  const post = async (payload: Record<string, unknown>, id: string) => {
    setBusy(id);
    setMessage(null);
    try {
      const res = await fetch("/api/hotel/reports/schedules", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ slug, ...payload }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage({ tone: "error", text: data.error ?? "That didn't work. Try again." });
        return null;
      }
      return data;
    } finally {
      setBusy(null);
    }
  };

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    const list = recipients.split(/[\s,;]+/).filter(Boolean);
    const data = await post({ action: "create", reportKey, frequency, sendHour, weekday: frequency === "weekly" ? weekday : null, monthDay: frequency === "monthly" ? monthDay : null, fileFormat, recipients: list }, "create");
    if (data?.schedule) {
      setSchedules((s) => [...s, data.schedule]);
      setMessage({ tone: "ok", text: "Scheduled. The first email goes out the next time it is due." });
    }
  };

  const toggle = async (s: ReportSchedule) => {
    const data = await post({ action: "toggle", id: s.id, active: !s.active }, s.id);
    if (data) setSchedules((list) => list.map((x) => (x.id === s.id ? { ...x, active: !s.active } : x)));
  };
  const remove = async (s: ReportSchedule) => {
    if (!window.confirm(`Stop emailing "${titleOf(s.reportKey)}"?`)) return;
    const data = await post({ action: "delete", id: s.id }, s.id);
    if (data) setSchedules((list) => list.filter((x) => x.id !== s.id));
  };
  const sendNow = async (s: ReportSchedule) => {
    const data = await post({ action: "send_now", id: s.id }, `now-${s.id}`);
    if (data) setMessage({ tone: "ok", text: `Sent to ${data.sent} ${data.sent === 1 ? "address" : "addresses"}.` });
  };

  return (
    <HmsPage wide>
      <HmsPageHeader
        eyebrow="Reports"
        meaning="money"
        title="Scheduled emails"
        description="Have a report emailed to chosen people on a regular schedule, as a PDF or an Excel file. Daily emails cover yesterday, weekly ones the last seven days and monthly ones the last full month."
      />
      <Link href={`/hms/${slug}/reports`} className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-700 hover:underline">
        <ArrowLeft className="h-4 w-4" aria-hidden /> All reports
      </Link>

      {message ? (
        <div
          role={message.tone === "ok" ? "status" : "alert"}
          className={`rounded-xl border px-4 py-3 text-sm ${message.tone === "ok" ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-red-200 bg-red-50 text-red-900"}`}
        >
          {message.text}
        </div>
      ) : null}

      <HmsCard id="schedule-new" title="Schedule a report" icon={CalendarClock} meaning="money">
        <form onSubmit={create} className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <HmsField id="sch-report" label="Report">
            <select id="sch-report" className={hmsInput} value={reportKey} onChange={(e) => setReportKey(e.target.value)}>
              {reports.map((r) => (
                <option key={r.key} value={r.key}>
                  {r.title}
                </option>
              ))}
            </select>
          </HmsField>
          <HmsField id="sch-format" label="File">
            <select id="sch-format" className={hmsInput} value={fileFormat} onChange={(e) => setFileFormat(e.target.value as "pdf" | "xlsx")}>
              <option value="pdf">PDF</option>
              <option value="xlsx">Excel</option>
            </select>
          </HmsField>
          <HmsField id="sch-frequency" label="How often">
            <select id="sch-frequency" className={hmsInput} value={frequency} onChange={(e) => setFrequency(e.target.value as "daily" | "weekly" | "monthly")}>
              <option value="daily">Every day</option>
              <option value="weekly">Every week</option>
              <option value="monthly">Every month</option>
            </select>
          </HmsField>
          <HmsField id="sch-hour" label="At (hotel time)">
            <select id="sch-hour" className={hmsInput} value={sendHour} onChange={(e) => setSendHour(Number(e.target.value))}>
              {Array.from({ length: 24 }, (_, h) => (
                <option key={h} value={h}>
                  {String(h).padStart(2, "0")}:00
                </option>
              ))}
            </select>
          </HmsField>
          {frequency === "weekly" ? (
            <HmsField id="sch-weekday" label="On">
              <select id="sch-weekday" className={hmsInput} value={weekday} onChange={(e) => setWeekday(Number(e.target.value))}>
                {WEEKDAYS.map((d, i) => (
                  <option key={d} value={i + 1}>
                    {d}
                  </option>
                ))}
              </select>
            </HmsField>
          ) : null}
          {frequency === "monthly" ? (
            <HmsField id="sch-monthday" label="On day of the month">
              <select id="sch-monthday" className={hmsInput} value={monthDay} onChange={(e) => setMonthDay(Number(e.target.value))}>
                {Array.from({ length: 28 }, (_, i) => (
                  <option key={i + 1} value={i + 1}>
                    {i + 1}
                  </option>
                ))}
              </select>
            </HmsField>
          ) : null}
          <div className="md:col-span-2">
            <HmsField id="sch-to" label="Send to" hint="Up to 10 email addresses, separated by commas.">
              <input id="sch-to" className={hmsInput} value={recipients} onChange={(e) => setRecipients(e.target.value)} placeholder="manager@yourhotel.com, owner@yourhotel.com" />
            </HmsField>
          </div>
          <div className="md:col-span-2">
            <button type="submit" className={`${hmsButton.primary} w-full sm:w-auto`} disabled={busy === "create" || !reportKey}>
              <Mail className="h-4 w-4" aria-hidden /> {busy === "create" ? "Saving…" : "Schedule it"}
            </button>
          </div>
        </form>
      </HmsCard>

      <HmsCard id="schedule-list" title="Your scheduled emails" flush={schedules.length > 0}>
        {schedules.length === 0 ? (
          <HmsEmptyState bare icon={Mail} meaning="money" title="Nothing scheduled yet" description="Pick a report above and who should get it." />
        ) : (
          <ul className="divide-y divide-slate-100">
            {schedules.map((s) => (
              <li key={s.id} className="flex flex-col gap-3 px-4 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0 wrap-break-word">
                  <p className="font-semibold text-slate-900">
                    {titleOf(s.reportKey)} <span className="font-normal text-slate-600">· {s.fileFormat === "pdf" ? "PDF" : "Excel"}</span>
                    {!s.active ? <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">Paused</span> : null}
                  </p>
                  <p className="text-sm text-slate-600">{describeSchedule(s)} to {s.recipients.join(", ")}</p>
                  <p className="text-sm text-slate-600">
                    {s.lastError ? <span className="text-red-700">Last send failed: {s.lastError}</span> : s.lastSentAt ? `Last sent ${new Date(s.lastSentAt).toLocaleString("en-GB")}` : "Not sent yet"}
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center *:w-full sm:*:w-auto">
                  <button type="button" className={hmsButton.small} disabled={busy !== null} onClick={() => void sendNow(s)}>
                    <Send className="h-4 w-4" aria-hidden /> {busy === `now-${s.id}` ? "Sending…" : "Send now"}
                  </button>
                  <button type="button" className={hmsButton.small} disabled={busy !== null} onClick={() => void toggle(s)}>
                    {s.active ? <Pause className="h-4 w-4" aria-hidden /> : <Play className="h-4 w-4" aria-hidden />} {s.active ? "Pause" : "Resume"}
                  </button>
                  <button type="button" className={`${hmsButton.danger} col-span-2 border border-red-100 sm:border-0`} disabled={busy !== null} onClick={() => void remove(s)}>
                    <Trash2 className="h-4 w-4" aria-hidden /> Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </HmsCard>
    </HmsPage>
  );
}

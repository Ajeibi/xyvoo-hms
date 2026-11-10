"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Banknote, CalendarDays, Clock, Lock, Palmtree, Tablet } from "lucide-react";
import { HmsAlert, HmsCard, HmsField, HmsPill, hmsButton, hmsInput } from "@/components/hms/hms-ui";
import { callHr, checkboxClass } from "@/components/hms/hr/hr-ui";
import type { PublicHoliday } from "@/lib/hms/hr/hr-holidays";
import type { HrSettings, LeaveType, ShiftTemplate } from "@/lib/hms/hr/hr-shared";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function useSave(slug: string, url = "/api/hotel/hr/settings") {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  async function save(body: Record<string, unknown>, done = "Saved.", method: "PATCH" | "POST" = "PATCH") {
    setBusy(true);
    setError("");
    setSaved("");
    const r = await callHr<Record<string, unknown>>(url, method, { slug, ...body });
    setBusy(false);
    if (r.error) {
      setError(r.error);
      return null;
    }
    setSaved(done);
    router.refresh();
    return r.data ?? {};
  }
  const status = (
    <div className="mt-2 space-y-1">
      <HmsAlert message={error} />
      {saved ? (
        <p role="status" className="text-sm text-emerald-700">
          {saved}
        </p>
      ) : null}
    </div>
  );
  return { busy, save, status };
}

export function HrSettingsClient(p: {
  slug: string;
  settings: HrSettings;
  leaveTypes: LeaveType[];
  templates: ShiftTemplate[];
  logins: { userId: string; name: string; role: string }[];
  grants: string[];
  isOwner: boolean;
  origin: string;
  holidays: PublicHoliday[];
  year: number;
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <RotaRules {...p} />
      <ClockScreen {...p} />
      <ShiftTypes {...p} />
      <LeaveTypes {...p} />
      <Holidays {...p} />
      <Payroll {...p} />
      <WhoSeesPay {...p} />
    </div>
  );
}

function RotaRules({ slug, settings }: { slug: string; settings: HrSettings }) {
  const { busy, save, status } = useSave(slug);
  const [f, setF] = useState({
    departments: settings.departments.join("\n"),
    weekStartsOn: String(settings.weekStartsOn),
    minRestHours: String(settings.minRestHours),
    maxWeeklyHours: String(settings.maxWeeklyHours),
    lateGraceMinutes: String(settings.lateGraceMinutes),
    overtimeAfterWeeklyHours: String(settings.overtimeAfterWeeklyHours),
    overtimeMultiplier: String(settings.overtimeMultiplier),
  });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  return (
    <HmsCard title="Departments and rota rules" icon={CalendarDays} meaning="team">
      <form
        className="grid gap-3 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          void save({
            action: "settings",
            departments: f.departments.split("\n").map((d) => d.trim()).filter(Boolean),
            weekStartsOn: Number(f.weekStartsOn),
            minRestHours: Number(f.minRestHours),
            maxWeeklyHours: Number(f.maxWeeklyHours),
            lateGraceMinutes: Number(f.lateGraceMinutes),
            overtimeAfterWeeklyHours: Number(f.overtimeAfterWeeklyHours),
            overtimeMultiplier: Number(f.overtimeMultiplier),
          });
        }}
      >
        <div className="sm:col-span-2">
          <HmsField id="hs-depts" label="Departments" hint="One per line.">
            <textarea id="hs-depts" rows={5} className={hmsInput} value={f.departments} onChange={set("departments")} />
          </HmsField>
        </div>
        <HmsField id="hs-week" label="Week starts on">
          <select id="hs-week" className={hmsInput} value={f.weekStartsOn} onChange={set("weekStartsOn")}>
            {DAYS.map((d, i) => (
              <option key={d} value={i}>
                {d}
              </option>
            ))}
          </select>
        </HmsField>
        <HmsField id="hs-rest" label="Least rest between shifts (hours)">
          <input id="hs-rest" type="number" min={0} max={24} step={0.5} className={hmsInput} value={f.minRestHours} onChange={set("minRestHours")} />
        </HmsField>
        <HmsField id="hs-max" label="Most hours in a week">
          <input id="hs-max" type="number" min={1} max={120} className={hmsInput} value={f.maxWeeklyHours} onChange={set("maxWeeklyHours")} />
        </HmsField>
        <HmsField id="hs-grace" label="Minutes before someone counts as late">
          <input id="hs-grace" type="number" min={0} max={120} className={hmsInput} value={f.lateGraceMinutes} onChange={set("lateGraceMinutes")} />
        </HmsField>
        <HmsField id="hs-ot" label="Overtime after (hours a week)">
          <input id="hs-ot" type="number" min={1} max={120} className={hmsInput} value={f.overtimeAfterWeeklyHours} onChange={set("overtimeAfterWeeklyHours")} />
        </HmsField>
        <HmsField id="hs-otx" label="Overtime rate (× normal pay)">
          <input id="hs-otx" type="number" min={1} max={5} step={0.25} className={hmsInput} value={f.overtimeMultiplier} onChange={set("overtimeMultiplier")} />
        </HmsField>
        <div className="sm:col-span-2">
          <button type="submit" className={hmsButton.primary} disabled={busy}>
            Save
          </button>
          {status}
        </div>
      </form>
    </HmsCard>
  );
}

function ClockScreen({ slug, settings, origin }: { slug: string; settings: HrSettings; origin: string }) {
  const { busy, save, status } = useSave(slug);
  const [link, setLink] = useState("");
  return (
    <HmsCard id="clock" title="Clock screen" icon={Tablet} meaning="team" description="Open the link on a tablet by the staff entrance. Staff clock in and out, take breaks, swap shifts and ask for leave with their PIN. No login needed.">
      <div className="space-y-3 text-sm">
        <p>
          Status: {settings.kioskEnabled && settings.hasKioskLink ? <HmsPill tone="green">On</HmsPill> : <HmsPill tone="amber">Not set up</HmsPill>}
        </p>
        {link ? (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
            <p className="font-medium text-emerald-900">Your clock screen link (shown once, so copy it now):</p>
            <p className="mt-1 break-all font-mono text-xs text-emerald-900">{link}</p>
            <button type="button" className={`${hmsButton.small} mt-2`} onClick={() => void navigator.clipboard?.writeText(link)}>
              Copy link
            </button>
          </div>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={hmsButton.primary}
            disabled={busy}
            onClick={async () => {
              const d = await save({ action: "kiosk_link" }, settings.hasKioskLink ? "New link made. The old one has stopped working." : "Clock screen is on.");
              if (d?.token) setLink(`${origin}/staff-clock/${d.token}`);
            }}
          >
            {settings.hasKioskLink ? "Make a new link" : "Turn on the clock screen"}
          </button>
          {settings.hasKioskLink ? (
            <button type="button" className={hmsButton.secondary} disabled={busy} onClick={() => void save({ action: "settings", kioskEnabled: !settings.kioskEnabled })}>
              {settings.kioskEnabled ? "Switch it off" : "Switch it back on"}
            </button>
          ) : null}
        </div>
        <label className="flex items-center gap-2">
          <input type="checkbox" className={checkboxClass} checked={settings.kioskSelfService} disabled={busy} onChange={(e) => void save({ action: "settings", kioskSelfService: e.target.checked })} />
          Staff can swap shifts, pick up open shifts and ask for leave there
        </label>
        <label className="flex items-start gap-2">
          <input type="checkbox" className={`${checkboxClass} mt-0.5`} checked={settings.kioskPhoto} disabled={busy} onChange={(e) => void save({ action: "settings", kioskPhoto: e.target.checked })} />
          <span>
            Take a photo at each clock-in and clock-out
            <span className="block text-xs text-slate-600">Stops one person clocking in for another. The tablet asks once for camera access; photos show on the Time page and are kept private.</span>
          </span>
        </label>
        {status}
      </div>
    </HmsCard>
  );
}

function ShiftTypes({ slug, settings, templates }: { slug: string; settings: HrSettings; templates: ShiftTemplate[] }) {
  const { busy, save, status } = useSave(slug, "/api/hotel/hr/rota");
  const [f, setF] = useState({ name: "", department: "", position: "", startTime: "07:00", endTime: "15:00", breakMinutes: "30" });
  return (
    <HmsCard title="Shift types" icon={Clock} meaning="team" description="Ready-made shifts to pick when planning the rota.">
      {templates.length ? (
        <ul className="mb-3 divide-y divide-slate-100 text-sm">
          {templates.map((t) => (
            <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
              <span>
                <strong>{t.name}</strong> {t.startTime}–{t.endTime}
                {t.breakMinutes ? ` · ${t.breakMinutes} min break` : ""}
                {t.department ? ` · ${t.department}` : ""}
                {!t.active ? " · hidden" : ""}
              </span>
              <button type="button" className={hmsButton.danger} disabled={busy} onClick={() => void save({ action: "template_delete", id: t.id }, "Removed.", "POST")}>
                Remove
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <form
        className="grid gap-2 sm:grid-cols-3"
        onSubmit={async (e) => {
          e.preventDefault();
          if (await save({ action: "template_save", ...f, department: f.department || null, position: f.position || null, breakMinutes: Number(f.breakMinutes) || 0, active: true }, "Added.", "POST"))
            setF({ ...f, name: "", position: "" });
        }}
      >
        <HmsField id="st-name" label="Name">
          <input id="st-name" required className={hmsInput} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Morning" />
        </HmsField>
        <HmsField id="st-start" label="Starts">
          <input id="st-start" type="time" required className={hmsInput} value={f.startTime} onChange={(e) => setF({ ...f, startTime: e.target.value })} />
        </HmsField>
        <HmsField id="st-end" label="Ends">
          <input id="st-end" type="time" required className={hmsInput} value={f.endTime} onChange={(e) => setF({ ...f, endTime: e.target.value })} />
        </HmsField>
        <HmsField id="st-break" label="Break (min)">
          <input id="st-break" type="number" min={0} max={240} className={hmsInput} value={f.breakMinutes} onChange={(e) => setF({ ...f, breakMinutes: e.target.value })} />
        </HmsField>
        <HmsField id="st-dept" label="Department" optional>
          <select id="st-dept" className={hmsInput} value={f.department} onChange={(e) => setF({ ...f, department: e.target.value })}>
            <option value="">Any</option>
            {settings.departments.map((d) => (
              <option key={d}>{d}</option>
            ))}
          </select>
        </HmsField>
        <HmsField id="st-pos" label="Position" optional>
          <input id="st-pos" className={hmsInput} value={f.position} onChange={(e) => setF({ ...f, position: e.target.value })} />
        </HmsField>
        <div className="sm:col-span-3">
          <button type="submit" className={hmsButton.secondary} disabled={busy}>
            Add shift type
          </button>
          {status}
        </div>
      </form>
    </HmsCard>
  );
}

function LeaveTypes({ slug, leaveTypes }: { slug: string; leaveTypes: LeaveType[] }) {
  const { busy, save, status } = useSave(slug);
  const [edit, setEdit] = useState<Partial<LeaveType> & { name: string } | null>(null);
  return (
    <HmsCard title="Leave types" icon={Palmtree} meaning="team" description="Defaults follow the Labour Act: at least 6 working days' annual leave after a year, up to 12 days' paid sick leave, 12 weeks' maternity leave.">
      <ul className="mb-3 divide-y divide-slate-100 text-sm">
        {leaveTypes.map((t) => (
          <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
            <span>
              <strong>{t.name}</strong> · {t.countsAgainstBalance ? `${t.daysPerYear} days a year` : "no limit"}
              {t.carryOverMax ? ` · carry over up to ${t.carryOverMax}` : ""} · {t.paid ? "paid" : "unpaid"}
              {!t.active ? " · switched off" : ""}
            </span>
            <button type="button" className={hmsButton.quiet} onClick={() => setEdit({ ...t })}>
              Change
            </button>
          </li>
        ))}
      </ul>
      {!edit ? (
        <button type="button" className={hmsButton.secondary} onClick={() => setEdit({ name: "", paid: true, daysPerYear: 0, carryOverMax: 0, countsAgainstBalance: true, active: true })}>
          Add a leave type
        </button>
      ) : (
        <form
          className="grid gap-2 sm:grid-cols-3"
          onSubmit={async (e) => {
            e.preventDefault();
            if (
              await save({
                action: "leave_type",
                id: edit.id,
                name: edit.name,
                paid: edit.paid ?? true,
                daysPerYear: Number(edit.daysPerYear) || 0,
                carryOverMax: Number(edit.carryOverMax) || 0,
                countsAgainstBalance: edit.countsAgainstBalance ?? true,
                active: edit.active ?? true,
              })
            )
              setEdit(null);
          }}
        >
          <HmsField id="lt-name" label="Name">
            <input id="lt-name" required className={hmsInput} value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
          </HmsField>
          <HmsField id="lt-days" label="Days a year">
            <input id="lt-days" type="number" min={0} step={0.5} className={hmsInput} value={edit.daysPerYear ?? 0} onChange={(e) => setEdit({ ...edit, daysPerYear: Number(e.target.value) })} />
          </HmsField>
          <HmsField id="lt-carry" label="Carry over up to">
            <input id="lt-carry" type="number" min={0} step={0.5} className={hmsInput} value={edit.carryOverMax ?? 0} onChange={(e) => setEdit({ ...edit, carryOverMax: Number(e.target.value) })} />
          </HmsField>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className={checkboxClass} checked={edit.paid ?? true} onChange={(e) => setEdit({ ...edit, paid: e.target.checked })} /> Paid
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className={checkboxClass} checked={edit.countsAgainstBalance ?? true} onChange={(e) => setEdit({ ...edit, countsAgainstBalance: e.target.checked })} /> Has a yearly limit
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className={checkboxClass} checked={edit.active ?? true} onChange={(e) => setEdit({ ...edit, active: e.target.checked })} /> In use
          </label>
          <div className="flex gap-2 sm:col-span-3">
            <button type="submit" className={hmsButton.primary} disabled={busy}>
              Save
            </button>
            <button type="button" className={hmsButton.secondary} onClick={() => setEdit(null)}>
              Cancel
            </button>
          </div>
        </form>
      )}
      {status}
    </HmsCard>
  );
}

function Payroll({ slug, settings }: { slug: string; settings: HrSettings }) {
  const { busy, save, status } = useSave(slug);
  const [f, setF] = useState({
    pensionEnabled: settings.pensionEnabled,
    nsitfEnabled: settings.nsitfEnabled,
    itfEnabled: settings.itfEnabled,
    payDay: String(settings.payDay),
    expenseAccountCode: settings.expenseAccountCode,
    payeAccountCode: settings.payeAccountCode,
    statutoryAccountCode: settings.statutoryAccountCode,
    netPayAccountCode: settings.netPayAccountCode,
    bankAccountCode: settings.bankAccountCode,
  });
  const tick = (k: "pensionEnabled" | "nsitfEnabled" | "itfEnabled", label: string) => (
    <label className="flex items-center gap-2 text-sm sm:col-span-2">
      <input type="checkbox" className={checkboxClass} checked={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.checked })} /> {label}
    </label>
  );
  const code = (k: "expenseAccountCode" | "payeAccountCode" | "statutoryAccountCode" | "netPayAccountCode" | "bankAccountCode", label: string) => (
    <HmsField id={`pc-${k}`} label={label}>
      <input id={`pc-${k}`} className={hmsInput} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} />
    </HmsField>
  );
  return (
    <HmsCard title="Payroll" icon={Banknote} meaning="money" description="Tax and contribution rates are set by law and kept in one place in the code, with their sources.">
      <form
        className="grid gap-3 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          void save({ action: "settings", ...f, payDay: Number(f.payDay) });
        }}
      >
        {tick("pensionEnabled", "Run the contributory pension (needed with 3 or more staff)")}
        {tick("nsitfEnabled", "Pay NSITF employee compensation (1% of payroll)")}
        {tick("itfEnabled", "Accrue ITF (1% of payroll; 5 or more staff or ₦50m turnover)")}
        <HmsField id="pc-day" label="Pay day of the month">
          <input id="pc-day" type="number" min={1} max={31} className={hmsInput} value={f.payDay} onChange={(e) => setF({ ...f, payDay: e.target.value })} />
        </HmsField>
        <p className="text-sm text-slate-600 sm:col-span-2">Account codes from your chart of accounts:</p>
        {code("expenseAccountCode", "Payroll expense")}
        {code("payeAccountCode", "PAYE owed")}
        {code("statutoryAccountCode", "Pension, NHF, NSITF, ITF owed")}
        {code("netPayAccountCode", "Net pay owed to staff")}
        {code("bankAccountCode", "Bank account salaries are paid from")}
        <div className="sm:col-span-2">
          <button type="submit" className={hmsButton.primary} disabled={busy}>
            Save
          </button>
          {status}
        </div>
      </form>
    </HmsCard>
  );
}

function Holidays({ slug, holidays, year }: { slug: string; holidays: PublicHoliday[]; year: number }) {
  const { busy, save, status } = useSave(slug);
  const [date, setDate] = useState("");
  const [name, setName] = useState("");
  const fmt = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
  return (
    <HmsCard
      title="Public holidays"
      icon={CalendarDays}
      meaning="team"
      description="Leave and part-month pay skip these days as well as weekends. Add the Eid holidays and the Prophet's birthday when the government announces the dates, and any replacement Monday it declares."
    >
      <div className="space-y-3 text-sm">
        <div className="flex flex-wrap gap-2">
          {[year, year + 1].map((y) => (
            <button key={y} type="button" className={hmsButton.secondary} disabled={busy} onClick={() => void save({ action: "holiday_defaults", year: y }, `Nigeria's fixed holidays for ${y} are in.`)}>
              Add Nigeria&apos;s fixed holidays for {y}
            </button>
          ))}
        </div>
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            const d = await save({ action: "holiday_add", date, name }, "Holiday added.");
            if (d) {
              setDate("");
              setName("");
            }
          }}
        >
          <HmsField id="hol-date" label="Date">
            <input id="hol-date" type="date" required className={hmsInput} value={date} onChange={(e) => setDate(e.target.value)} />
          </HmsField>
          <HmsField id="hol-name" label="Name">
            <input id="hol-name" required maxLength={80} className={hmsInput} placeholder="Eid al-Fitr" value={name} onChange={(e) => setName(e.target.value)} />
          </HmsField>
          <button type="submit" className={hmsButton.primary} disabled={busy}>
            Add
          </button>
        </form>
        {holidays.length === 0 ? (
          <p className="text-slate-600">No public holidays yet, so only weekends are skipped.</p>
        ) : (
          <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
            {holidays.map((h) => (
              <li key={h.id} className="flex items-center justify-between gap-2 px-3 py-1.5">
                <span>
                  <span className="tabular-nums text-slate-600">{fmt(h.date)}</span> · <span className="text-slate-900">{h.name}</span>
                </span>
                <button type="button" className={hmsButton.quiet} disabled={busy} onClick={() => void save({ action: "holiday_remove", id: h.id }, "Removed.")} aria-label={`Remove ${h.name}`}>
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
        {status}
      </div>
    </HmsCard>
  );
}

function WhoSeesPay({ slug, logins, grants, isOwner }: { slug: string; logins: { userId: string; name: string; role: string }[]; grants: string[]; isOwner: boolean }) {
  const { busy, save, status } = useSave(slug);
  const granted = new Set(grants);
  return (
    <HmsCard title="Who can see pay and personal details" icon={Lock} meaning="team" description="The owner always can. Everyone else in HR sees work details, rotas, time and leave, but not pay, bank details, ID numbers or addresses. The database enforces this.">
      {!isOwner ? (
        <p className="mb-2 text-sm text-slate-600">Only the owner can change this list.</p>
      ) : null}
      {logins.length === 0 ? (
        <p className="text-sm text-slate-600">No other logins yet.</p>
      ) : (
        <ul className="divide-y divide-slate-100 text-sm">
          {logins.map((l) => (
            <li key={l.userId} className="flex items-center justify-between gap-2 py-1.5">
              <label className="flex items-center gap-2" htmlFor={`g-${l.userId}`}>
                <input
                  id={`g-${l.userId}`}
                  type="checkbox"
                  className={checkboxClass}
                  checked={granted.has(l.userId)}
                  disabled={!isOwner || busy}
                  onChange={(e) => void save({ action: "grant", userId: l.userId, granted: e.target.checked }, e.target.checked ? `${l.name} can now see pay.` : `${l.name} can no longer see pay.`)}
                />
                {l.name}
              </label>
              <span className="text-slate-500">{l.role}</span>
            </li>
          ))}
        </ul>
      )}
      {status}
    </HmsCard>
  );
}


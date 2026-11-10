"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Banknote, FileText, IdCard, KeyRound, Trash2, UserRound } from "lucide-react";
import { HmsAlert, HmsCard, HmsField, HmsPill, hmsButton, hmsInput } from "@/components/hms/hms-ui";
import { PrivateLocked, callHr, checkboxClass } from "@/components/hms/hr/hr-ui";
import { calculatePay } from "@/lib/hms/hr/payroll-calc";
import {
  DOCUMENT_KINDS,
  EMPLOYMENT_TYPES,
  EMPLOYMENT_TYPE_LABEL,
  EMPLOYEE_STATUS_LABEL,
  PAY_BASES,
  naira,
  type Employee,
  type EmployeeDocument,
  type EmployeePrivate,
  type PayProfile,
} from "@/lib/hms/hr/hr-shared";

type Props = {
  slug: string;
  employee: Employee;
  departments: string[];
  logins: { userId: string; label: string }[];
  canSeePrivate: boolean;
  details: EmployeePrivate | null;
  pay: PayProfile | null;
  documents: EmployeeDocument[];
  payrollSwitches: { pensionEnabled: boolean; nsitfEnabled: boolean; itfEnabled: boolean };
};

function useAction(slug: string, id: string) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  async function run(body: Record<string, unknown>, done = "Saved.") {
    setBusy(true);
    setError("");
    setSaved("");
    const { error: err } = await callHr(`/api/hotel/hr/employees/${id}`, "PATCH", { slug, ...body });
    setBusy(false);
    if (err) {
      setError(err);
      return false;
    }
    setSaved(done);
    router.refresh();
    return true;
  }
  return { busy, error, saved, run };
}

function Saved({ text }: { text: string }) {
  return text ? (
    <p role="status" className="text-sm text-emerald-700">
      {text}
    </p>
  ) : null;
}

export function EmployeeClient(p: Props) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <WorkDetails {...p} />
      <div className="space-y-4">
        <PinCard {...p} />
        <StatusCard {...p} />
      </div>
      {p.canSeePrivate ? (
        <>
          <PersonalCard {...p} />
          <PayCard {...p} />
          <div className="lg:col-span-2">
            <DocumentsCard {...p} />
          </div>
        </>
      ) : (
        <div className="lg:col-span-2">
          <HmsCard title="Pay and personal details" icon={IdCard} meaning="team">
            <PrivateLocked />
          </HmsCard>
        </div>
      )}
    </div>
  );
}

function WorkDetails({ slug, employee: e, departments, logins }: Props) {
  const { busy, error, saved, run } = useAction(slug, e.id);
  const [f, setF] = useState({
    firstName: e.firstName,
    lastName: e.lastName,
    preferredName: e.preferredName ?? "",
    jobTitle: e.jobTitle ?? "",
    department: e.department ?? "",
    employmentType: e.employmentType as string,
    startDate: e.startDate ?? "",
    workEmail: e.workEmail ?? "",
    workPhone: e.workPhone ?? "",
    userId: e.userId ?? "",
    contractedHoursWeek: e.contractedHoursWeek?.toString() ?? "",
  });
  const set = (k: keyof typeof f) => (ev: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF((x) => ({ ...x, [k]: ev.target.value }));
  return (
    <HmsCard title="Work details" icon={UserRound} meaning="team" description={`${e.employeeNumber} · anyone in HR can see these.`}>
      <form
        className="grid gap-3 sm:grid-cols-2"
        onSubmit={(ev) => {
          ev.preventDefault();
          void run({
            action: "details",
            ...f,
            preferredName: f.preferredName || null,
            jobTitle: f.jobTitle || null,
            department: f.department || null,
            startDate: f.startDate || null,
            workEmail: f.workEmail || "",
            workPhone: f.workPhone || null,
            userId: f.userId || null,
            contractedHoursWeek: f.contractedHoursWeek ? Number(f.contractedHoursWeek) : null,
          });
        }}
      >
        <HmsField id="w-first" label="First name">
          <input id="w-first" required className={hmsInput} value={f.firstName} onChange={set("firstName")} />
        </HmsField>
        <HmsField id="w-last" label="Last name">
          <input id="w-last" required className={hmsInput} value={f.lastName} onChange={set("lastName")} />
        </HmsField>
        <HmsField id="w-pref" label="Known as" optional>
          <input id="w-pref" className={hmsInput} value={f.preferredName} onChange={set("preferredName")} />
        </HmsField>
        <HmsField id="w-title" label="Job title" optional>
          <input id="w-title" className={hmsInput} value={f.jobTitle} onChange={set("jobTitle")} />
        </HmsField>
        <HmsField id="w-dept" label="Department">
          <select id="w-dept" className={hmsInput} value={f.department} onChange={set("department")}>
            <option value="">No department</option>
            {[...new Set([...departments, ...(e.department ? [e.department] : [])])].map((d) => (
              <option key={d}>{d}</option>
            ))}
          </select>
        </HmsField>
        <HmsField id="w-type" label="Type of work">
          <select id="w-type" className={hmsInput} value={f.employmentType} onChange={set("employmentType")}>
            {EMPLOYMENT_TYPES.map((t) => (
              <option key={t} value={t}>
                {EMPLOYMENT_TYPE_LABEL[t]}
              </option>
            ))}
          </select>
        </HmsField>
        <HmsField id="w-start" label="Start date" optional>
          <input id="w-start" type="date" className={hmsInput} value={f.startDate} onChange={set("startDate")} />
        </HmsField>
        <HmsField id="w-hours" label="Contracted hours a week" optional>
          <input id="w-hours" type="number" min={0} max={100} className={hmsInput} value={f.contractedHoursWeek} onChange={set("contractedHoursWeek")} />
        </HmsField>
        <HmsField id="w-phone" label="Work phone" optional>
          <input id="w-phone" type="tel" className={hmsInput} value={f.workPhone} onChange={set("workPhone")} />
        </HmsField>
        <HmsField id="w-email" label="Work email" optional>
          <input id="w-email" type="email" className={hmsInput} value={f.workEmail} onChange={set("workEmail")} />
        </HmsField>
        <div className="sm:col-span-2">
          <HmsField id="w-login" label="Their XYVOO login" optional>
            <select id="w-login" className={hmsInput} value={f.userId} onChange={set("userId")}>
              <option value="">No login</option>
              {logins.map((l) => (
                <option key={l.userId} value={l.userId}>
                  {l.label}
                </option>
              ))}
            </select>
          </HmsField>
        </div>
        <div className="space-y-2 sm:col-span-2">
          <HmsAlert message={error} />
          <Saved text={saved} />
          <button type="submit" className={hmsButton.primary} disabled={busy}>
            {busy ? "Saving…" : "Save work details"}
          </button>
        </div>
      </form>
    </HmsCard>
  );
}

function PinCard({ slug, employee: e }: Props) {
  const { busy, error, saved, run } = useAction(slug, e.id);
  const [pin, setPin] = useState("");
  return (
    <HmsCard title="Clock screen PIN" icon={KeyRound} meaning="team" description="They type this on the clock screen to clock in and out, ask for leave or swap shifts.">
      <p className="mb-2 text-sm">{e.hasPin ? <HmsPill tone="green">A PIN is set</HmsPill> : <HmsPill tone="amber">No PIN yet</HmsPill>}</p>
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={async (ev) => {
          ev.preventDefault();
          if (await run({ action: "pin", pin }, "PIN saved. Tell them in person; it isn't shown again.")) setPin("");
        }}
      >
        <HmsField id="pin" label="New PIN (4 to 6 numbers)">
          <input id="pin" inputMode="numeric" pattern="\d{4,6}" maxLength={6} autoComplete="off" className={`${hmsInput} w-40`} value={pin} onChange={(ev) => setPin(ev.target.value.replace(/\D/g, ""))} />
        </HmsField>
        <button type="submit" className={hmsButton.secondary} disabled={busy || pin.length < 4}>
          Set PIN
        </button>
        {e.hasPin ? (
          <button type="button" className={hmsButton.danger} disabled={busy} onClick={() => void run({ action: "pin", pin: null }, "PIN removed.")}>
            Remove PIN
          </button>
        ) : null}
      </form>
      <div className="mt-2 space-y-1">
        <HmsAlert message={error} />
        <Saved text={saved} />
      </div>
    </HmsCard>
  );
}

function StatusCard({ slug, employee: e }: Props) {
  const { busy, error, saved, run } = useAction(slug, e.id);
  const [endDate, setEndDate] = useState("");
  const [reason, setReason] = useState("");
  return (
    <HmsCard title="Status" description={`Now: ${EMPLOYEE_STATUS_LABEL[e.status]}${e.endDate ? `, last day ${e.endDate}` : ""}${e.leavingReason ? ` (${e.leavingReason})` : ""}`}>
      {e.status === "left" ? (
        <button type="button" className={hmsButton.secondary} disabled={busy} onClick={() => void run({ action: "status", status: "active" }, "Back on the active list.")}>
          They&apos;re back: make active
        </button>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {e.status === "suspended" ? (
              <button type="button" className={hmsButton.secondary} disabled={busy} onClick={() => void run({ action: "status", status: "active" })}>
                End suspension
              </button>
            ) : (
              <button type="button" className={hmsButton.secondary} disabled={busy} onClick={() => void run({ action: "status", status: "suspended" })}>
                Suspend
              </button>
            )}
          </div>
          <form
            className="grid gap-2 sm:grid-cols-2"
            onSubmit={(ev) => {
              ev.preventDefault();
              void run({ action: "status", status: "left", endDate, leavingReason: reason || null }, "Marked as left. Their PIN is removed and later shifts are open again.");
            }}
          >
            <HmsField id="end" label="Last working day">
              <input id="end" type="date" required className={hmsInput} value={endDate} onChange={(ev) => setEndDate(ev.target.value)} />
            </HmsField>
            <HmsField id="why" label="Reason" optional>
              <input id="why" className={hmsInput} value={reason} onChange={(ev) => setReason(ev.target.value)} />
            </HmsField>
            <div className="sm:col-span-2">
              <button type="submit" className={hmsButton.danger} disabled={busy || !endDate}>
                Mark as left
              </button>
            </div>
          </form>
        </div>
      )}
      <div className="mt-2 space-y-1">
        <HmsAlert message={error} />
        <Saved text={saved} />
      </div>
    </HmsCard>
  );
}

const PERSONAL_FIELDS: { key: keyof EmployeePrivate; label: string; type?: string; wide?: boolean }[] = [
  { key: "dateOfBirth", label: "Date of birth", type: "date" },
  { key: "gender", label: "Gender" },
  { key: "maritalStatus", label: "Marital status" },
  { key: "stateOfResidence", label: "State of residence", },
  { key: "homeAddress", label: "Home address", wide: true },
  { key: "personalPhone", label: "Personal phone", type: "tel" },
  { key: "personalEmail", label: "Personal email", type: "email" },
  { key: "nextOfKinName", label: "Next of kin" },
  { key: "nextOfKinRelationship", label: "Relationship" },
  { key: "nextOfKinPhone", label: "Next of kin phone", type: "tel" },
  { key: "nin", label: "NIN" },
  { key: "tin", label: "Tax ID (TIN)" },
  { key: "bankName", label: "Bank" },
  { key: "bankAccountNumber", label: "Account number" },
  { key: "bankAccountName", label: "Account name" },
  { key: "pfaName", label: "Pension administrator (PFA)" },
  { key: "rsaPin", label: "RSA PIN" },
  { key: "nhfNumber", label: "NHF number" },
  { key: "guarantorName", label: "Guarantor" },
  { key: "guarantorPhone", label: "Guarantor phone", type: "tel" },
  { key: "notes", label: "Notes", wide: true },
];

function PersonalCard({ slug, employee: e, details }: Props) {
  const { busy, error, saved, run } = useAction(slug, e.id);
  const [f, setF] = useState<Record<string, string>>(() =>
    Object.fromEntries(PERSONAL_FIELDS.map((x) => [x.key, (details?.[x.key] as string | null) ?? ""])),
  );
  return (
    <HmsCard title="Personal details" icon={IdCard} meaning="team" description="Private: only the owner and the people they choose can see these.">
      <form
        className="grid gap-3 sm:grid-cols-2"
        onSubmit={(ev) => {
          ev.preventDefault();
          void run({ action: "private", details: Object.fromEntries(Object.entries(f).map(([k, v]) => [k, v || null])) });
        }}
      >
        {PERSONAL_FIELDS.map((x) => (
          <div key={x.key} className={x.wide ? "sm:col-span-2" : undefined}>
            <HmsField id={`p-${x.key}`} label={x.label} optional>
              <input
                id={`p-${x.key}`}
                type={x.type ?? "text"}
                autoComplete="off"
                className={hmsInput}
                value={f[x.key]}
                onChange={(ev) => setF((s) => ({ ...s, [x.key]: ev.target.value }))}
              />
            </HmsField>
          </div>
        ))}
        <div className="space-y-2 sm:col-span-2">
          <HmsAlert message={error} />
          <Saved text={saved} />
          <button type="submit" className={hmsButton.primary} disabled={busy}>
            {busy ? "Saving…" : "Save personal details"}
          </button>
        </div>
      </form>
    </HmsCard>
  );
}

function PayCard({ slug, employee: e, pay, payrollSwitches }: Props) {
  const { busy, error, saved, run } = useAction(slug, e.id);
  const start = pay ?? null;
  const [f, setF] = useState({
    payBasis: start?.payBasis ?? "monthly",
    basicMonthly: String(start?.basicMonthly ?? 0),
    housingMonthly: String(start?.housingMonthly ?? 0),
    transportMonthly: String(start?.transportMonthly ?? 0),
    otherAllowancesMonthly: String(start?.otherAllowancesMonthly ?? 0),
    hourlyRate: String(start?.hourlyRate ?? 0),
    dailyRate: String(start?.dailyRate ?? 0),
    annualRentPaid: String(start?.annualRentPaid ?? 0),
    otherReliefsAnnual: String(start?.otherReliefsAnnual ?? 0),
    monthlyDeductions: String(start?.monthlyDeductions ?? 0),
    monthlyDeductionsNote: start?.monthlyDeductionsNote ?? "",
    pensionOptIn: start?.pensionOptIn ?? true,
    nhfOptIn: start?.nhfOptIn ?? false,
    payeExempt: start?.payeExempt ?? false,
  });
  const profile: PayProfile = useMemo(
    () => ({
      payBasis: f.payBasis as PayProfile["payBasis"],
      basicMonthly: Number(f.basicMonthly) || 0,
      housingMonthly: Number(f.housingMonthly) || 0,
      transportMonthly: Number(f.transportMonthly) || 0,
      otherAllowancesMonthly: Number(f.otherAllowancesMonthly) || 0,
      hourlyRate: Number(f.hourlyRate) || 0,
      dailyRate: Number(f.dailyRate) || 0,
      annualRentPaid: Number(f.annualRentPaid) || 0,
      otherReliefsAnnual: Number(f.otherReliefsAnnual) || 0,
      monthlyDeductions: Number(f.monthlyDeductions) || 0,
      monthlyDeductionsNote: f.monthlyDeductionsNote || null,
      pensionOptIn: f.pensionOptIn,
      nhfOptIn: f.nhfOptIn,
      payeExempt: f.payeExempt,
    }),
    [f],
  );
  const preview = useMemo(
    () =>
      f.payBasis === "monthly"
        ? calculatePay({
            profile,
            periodEnd: new Date().toISOString().slice(0, 10),
            regularHours: 0,
            overtimeHours: 0,
            overtimeMultiplier: 1.5,
            daysWorked: 0,
            workingDaysInPeriod: 22,
            unpaidLeaveDays: 0,
            contractedHoursWeek: e.contractedHoursWeek,
            oneOffAdditions: 0,
            ...payrollSwitches,
          })
        : null,
    [profile, f.payBasis, e.contractedHoursWeek, payrollSwitches],
  );
  const money = (k: keyof typeof f, label: string, hint?: string) => (
    <HmsField id={`pay-${k}`} label={label} hint={hint}>
      <input
        id={`pay-${k}`}
        type="number"
        min={0}
        step="0.01"
        className={hmsInput}
        value={f[k] as string}
        onChange={(ev) => setF((s) => ({ ...s, [k]: ev.target.value }))}
      />
    </HmsField>
  );
  const tick = (k: "pensionOptIn" | "nhfOptIn" | "payeExempt", label: string) => (
    <label className="flex items-center gap-2 text-sm text-slate-800">
      <input type="checkbox" className={checkboxClass} checked={f[k]} onChange={(ev) => setF((s) => ({ ...s, [k]: ev.target.checked }))} /> {label}
    </label>
  );
  return (
    <HmsCard title="Pay" icon={Banknote} meaning="money" description="Private. Monthly amounts in naira.">
      <form
        className="grid gap-3 sm:grid-cols-2"
        onSubmit={(ev) => {
          ev.preventDefault();
          void run({ action: "pay", pay: profile });
        }}
      >
        <div className="sm:col-span-2">
          <HmsField id="pay-basis" label="Paid">
            <select id="pay-basis" className={hmsInput} value={f.payBasis} onChange={(ev) => setF((s) => ({ ...s, payBasis: ev.target.value as PayProfile["payBasis"] }))}>
              {PAY_BASES.map((b) => (
                <option key={b} value={b}>
                  {b === "monthly" ? "A monthly salary" : b === "hourly" ? "By the hour (from approved timesheets)" : "By the day (days clocked in)"}
                </option>
              ))}
            </select>
          </HmsField>
        </div>
        {f.payBasis === "monthly" ? (
          <>
            {money("basicMonthly", "Basic salary")}
            {money("housingMonthly", "Housing allowance")}
            {money("transportMonthly", "Transport allowance")}
          </>
        ) : f.payBasis === "hourly" ? (
          money("hourlyRate", "Rate per hour")
        ) : (
          money("dailyRate", "Rate per day")
        )}
        {money("otherAllowancesMonthly", "Other allowances", "Meal, utility and similar. Taxed, not pensionable.")}
        {money("annualRentPaid", "Rent they pay a year", "For rent relief: 20% of rent, up to ₦500,000. Keep their proof of rent.")}
        {money("otherReliefsAnnual", "Other tax reliefs a year", "NHIS, life assurance or mortgage interest they can prove.")}
        {money("monthlyDeductions", "Other deductions each month", "Salary advance or loan repayments.")}
        <HmsField id="pay-dednote" label="What the deductions are for" optional>
          <input id="pay-dednote" className={hmsInput} value={f.monthlyDeductionsNote} onChange={(ev) => setF((s) => ({ ...s, monthlyDeductionsNote: ev.target.value }))} />
        </HmsField>
        <div className="space-y-2 sm:col-span-2">
          {tick("pensionOptIn", "Pays into a pension (8% from them, 10% from the hotel)")}
          {tick("nhfOptIn", "Agreed to NHF (2.5% of basic)")}
          {tick("payeExempt", "Exempt from PAYE (for example, a diplomat's or a tax-exempt post)")}
        </div>
        {preview ? (
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm sm:col-span-2" aria-live="polite">
            <p className="font-semibold text-slate-900">A normal month</p>
            <dl className="mt-1 grid grid-cols-2 gap-x-4 gap-y-0.5 text-slate-700">
              <dt>Gross</dt>
              <dd className="text-right tabular-nums">{naira(preview.gross)}</dd>
              <dt>PAYE</dt>
              <dd className="text-right tabular-nums">−{naira(preview.paye)}</dd>
              <dt>Pension (theirs)</dt>
              <dd className="text-right tabular-nums">−{naira(preview.pensionEmployee)}</dd>
              <dt>NHF</dt>
              <dd className="text-right tabular-nums">−{naira(preview.nhf)}</dd>
              <dt>Other deductions</dt>
              <dd className="text-right tabular-nums">−{naira(preview.otherDeductions)}</dd>
              <dt className="font-semibold text-slate-900">Take-home</dt>
              <dd className="text-right font-semibold tabular-nums text-slate-900">{naira(preview.netPay)}</dd>
              <dt>Cost to the hotel</dt>
              <dd className="text-right tabular-nums">{naira(preview.employerCost)}</dd>
            </dl>
            {preview.payeNote ? <p className="mt-1 text-xs text-slate-600">{preview.payeNote}</p> : null}
          </div>
        ) : null}
        <div className="space-y-2 sm:col-span-2">
          <HmsAlert message={error} />
          <Saved text={saved} />
          <button type="submit" className={hmsButton.primary} disabled={busy}>
            {busy ? "Saving…" : "Save pay"}
          </button>
        </div>
      </form>
    </HmsCard>
  );
}

/** A file picker that uploads a scan for one document as soon as a file is chosen. */
function ScanUpload({ slug, employeeId, documentId, label, kind }: { slug: string; employeeId: string; documentId: string; label: string; kind: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const inputId = `scan-${documentId}`;
  return (
    <span className="inline-flex flex-col">
      <label htmlFor={inputId} className={`${hmsButton.small} cursor-pointer ${busy ? "pointer-events-none opacity-50" : ""}`}>
        {busy ? "Uploading…" : label}
      </label>
      <input
        id={inputId}
        type="file"
        accept="application/pdf,image/jpeg,image/png,image/webp"
        className="sr-only"
        aria-label={`${label} for ${kind}`}
        disabled={busy}
        onChange={async (ev) => {
          const file = ev.target.files?.[0];
          ev.target.value = "";
          if (!file) return;
          setBusy(true);
          setError("");
          const fd = new FormData();
          fd.set("slug", slug);
          fd.set("documentId", documentId);
          fd.set("file", file);
          const res = await fetch(`/api/hotel/hr/employees/${employeeId}/documents`, { method: "POST", body: fd }).catch(() => null);
          const json = res ? await res.json().catch(() => ({})) : {};
          setBusy(false);
          if (!res?.ok) {
            setError((json as { error?: string }).error ?? "Couldn't upload the file.");
            return;
          }
          router.refresh();
        }}
      />
      {error ? (
        <span role="alert" className="mt-1 text-xs text-red-700">
          {error}
        </span>
      ) : null}
    </span>
  );
}

function DocumentsCard({ slug, employee: e, documents }: Props) {
  const { busy, error, saved, run } = useAction(slug, e.id);
  const [f, setF] = useState({ kind: DOCUMENT_KINDS[0] as string, reference: "", receivedOn: "", expiresOn: "", note: "" });
  const [{ today, soon }] = useState(() => ({
    today: new Date().toISOString().slice(0, 10),
    soon: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
  }));
  const held = new Set(documents.map((d) => d.kind));
  const missing = DOCUMENT_KINDS.filter((k) => k !== "Other" && k !== "Food handler certificate" && k !== "Reference letter" && !held.has(k));
  return (
    <HmsCard title="Documents" icon={FileText} meaning="team" description="What the hotel holds for them, when it runs out, and a scan of each (PDF or photo, up to 8 MB). Only people who can see pay can open the scans.">
      {missing.length ? (
        <p className="mb-3 text-sm text-amber-800">Missing: {missing.join(", ")}.</p>
      ) : null}
      {documents.length ? (
        <ul className="mb-4 divide-y divide-slate-100 text-sm">
          {documents.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span>
                <span className="font-medium text-slate-900">{d.kind}</span>
                {d.reference ? <span className="text-slate-600"> · {d.reference}</span> : null}
                {d.receivedOn ? <span className="text-slate-500"> · received {d.receivedOn}</span> : null}
                {d.expiresOn ? (
                  <>
                    {" "}
                    <HmsPill tone={d.expiresOn < today ? "red" : d.expiresOn <= soon ? "amber" : "slate"}>
                      {d.expiresOn < today ? "Expired" : "Expires"} {d.expiresOn}
                    </HmsPill>
                  </>
                ) : null}
              </span>
              <span className="flex flex-wrap items-center gap-1">
                {d.hasFile ? (
                  <a
                    className={hmsButton.small}
                    href={`/api/hotel/hr/employees/${e.id}/documents?slug=${encodeURIComponent(slug)}&documentId=${d.id}`}
                    target="_blank"
                    rel="noreferrer"
                    title={d.fileName ?? undefined}
                  >
                    Open scan
                  </a>
                ) : null}
                <ScanUpload slug={slug} employeeId={e.id} documentId={d.id} label={d.hasFile ? "Replace" : "Upload scan"} kind={d.kind} />
                <button type="button" className={hmsButton.danger} disabled={busy} onClick={() => void run({ action: "document_remove", documentId: d.id }, "Removed.")}>
                  <Trash2 className="h-4 w-4" aria-hidden /> <span className="sr-only">Remove {d.kind}</span>
                </button>
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      <form
        className="grid gap-3 sm:grid-cols-5"
        onSubmit={async (ev) => {
          ev.preventDefault();
          if (await run({ action: "document_add", ...f, reference: f.reference || null, receivedOn: f.receivedOn || null, expiresOn: f.expiresOn || null, note: f.note || null }, "Added."))
            setF((s) => ({ ...s, reference: "", receivedOn: "", expiresOn: "", note: "" }));
        }}
      >
        <HmsField id="d-kind" label="Document">
          <select id="d-kind" className={hmsInput} value={f.kind} onChange={(ev) => setF((s) => ({ ...s, kind: ev.target.value }))}>
            {DOCUMENT_KINDS.map((k) => (
              <option key={k}>{k}</option>
            ))}
          </select>
        </HmsField>
        <HmsField id="d-ref" label="Reference" optional>
          <input id="d-ref" className={hmsInput} value={f.reference} onChange={(ev) => setF((s) => ({ ...s, reference: ev.target.value }))} />
        </HmsField>
        <HmsField id="d-got" label="Received" optional>
          <input id="d-got" type="date" className={hmsInput} value={f.receivedOn} onChange={(ev) => setF((s) => ({ ...s, receivedOn: ev.target.value }))} />
        </HmsField>
        <HmsField id="d-exp" label="Expires" optional>
          <input id="d-exp" type="date" className={hmsInput} value={f.expiresOn} onChange={(ev) => setF((s) => ({ ...s, expiresOn: ev.target.value }))} />
        </HmsField>
        <div className="flex items-end">
          <button type="submit" className={hmsButton.secondary} disabled={busy}>
            Add document
          </button>
        </div>
      </form>
      <div className="mt-2 space-y-1">
        <HmsAlert message={error} />
        <Saved text={saved} />
      </div>
    </HmsCard>
  );
}

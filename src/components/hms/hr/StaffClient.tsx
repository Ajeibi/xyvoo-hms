"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { UserPlus, Users } from "lucide-react";
import { HmsAlert, HmsCard, HmsEmptyState, HmsField, HmsPill, hmsButton, hmsInput } from "@/components/hms/hms-ui";
import { callHr } from "@/components/hms/hr/hr-ui";
import { EMPLOYMENT_TYPES, EMPLOYMENT_TYPE_LABEL, EMPLOYEE_STATUS_LABEL, type Employee } from "@/lib/hms/hr/hr-shared";

type Login = { userId: string; label: string };

export function StaffClient({
  slug,
  employees,
  departments,
  logins,
  startOpen = false,
}: {
  slug: string;
  employees: Employee[];
  departments: string[];
  logins: Login[];
  startOpen?: boolean;
}) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(startOpen);
  const [query, setQuery] = useState("");
  const [dept, setDept] = useState("");
  const [showLeft, setShowLeft] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    jobTitle: "",
    department: departments[0] ?? "",
    employmentType: "full_time",
    startDate: "",
    workEmail: "",
    workPhone: "",
    userId: "",
    contractedHoursWeek: "40",
  });

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return employees.filter(
      (e) =>
        (showLeft || e.status !== "left") &&
        (!dept || e.department === dept) &&
        (!q || `${e.fullName} ${e.employeeNumber} ${e.jobTitle ?? ""}`.toLowerCase().includes(q)),
    );
  }, [employees, query, dept, showLeft]);

  async function add(ev: React.FormEvent) {
    ev.preventDefault();
    setBusy(true);
    setError("");
    const { error: err, data } = await callHr<{ id: string }>("/api/hotel/hr/employees", "POST", {
      slug,
      firstName: form.firstName,
      lastName: form.lastName,
      jobTitle: form.jobTitle || null,
      department: form.department || null,
      employmentType: form.employmentType,
      startDate: form.startDate || null,
      workEmail: form.workEmail || null,
      workPhone: form.workPhone || null,
      userId: form.userId || null,
      contractedHoursWeek: form.contractedHoursWeek ? Number(form.contractedHoursWeek) : null,
    });
    if (err) {
      setBusy(false);
      return setError(err);
    }
    // Stay on "Adding…" while the new record opens.
    router.push(`/hms/${slug}/hr/staff/${data?.id}`);
  }

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <div className="space-y-4">
      {showForm ? (
        <HmsCard title="Add a member of staff" description="Pay and personal details are added on their record afterwards." icon={UserPlus} meaning="team">
          <form onSubmit={add} className="grid gap-3 sm:grid-cols-2">
            <HmsField id="first" label="First name">
              <input id="first" required className={hmsInput} value={form.firstName} onChange={set("firstName")} autoComplete="off" />
            </HmsField>
            <HmsField id="last" label="Last name">
              <input id="last" required className={hmsInput} value={form.lastName} onChange={set("lastName")} autoComplete="off" />
            </HmsField>
            <HmsField id="title" label="Job title" optional>
              <input id="title" className={hmsInput} value={form.jobTitle} onChange={set("jobTitle")} />
            </HmsField>
            <HmsField id="dept" label="Department">
              <select id="dept" className={hmsInput} value={form.department} onChange={set("department")}>
                <option value="">No department</option>
                {departments.map((d) => (
                  <option key={d}>{d}</option>
                ))}
              </select>
            </HmsField>
            <HmsField id="type" label="Type of work">
              <select id="type" className={hmsInput} value={form.employmentType} onChange={set("employmentType")}>
                {EMPLOYMENT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {EMPLOYMENT_TYPE_LABEL[t]}
                  </option>
                ))}
              </select>
            </HmsField>
            <HmsField id="start" label="Start date" optional>
              <input id="start" type="date" className={hmsInput} value={form.startDate} onChange={set("startDate")} />
            </HmsField>
            <HmsField id="hours" label="Contracted hours a week" optional>
              <input id="hours" type="number" min={0} max={100} className={hmsInput} value={form.contractedHoursWeek} onChange={set("contractedHoursWeek")} />
            </HmsField>
            <HmsField id="phone" label="Work phone" optional>
              <input id="phone" type="tel" className={hmsInput} value={form.workPhone} onChange={set("workPhone")} />
            </HmsField>
            <HmsField id="email" label="Work email" hint="Used to send them their rota." optional>
              <input id="email" type="email" className={hmsInput} value={form.workEmail} onChange={set("workEmail")} />
            </HmsField>
            <HmsField id="login" label="Their XYVOO login" hint="Only if they have one. Staff without a login use the clock screen." optional>
              <select id="login" className={hmsInput} value={form.userId} onChange={set("userId")}>
                <option value="">No login</option>
                {logins.map((l) => (
                  <option key={l.userId} value={l.userId}>
                    {l.label}
                  </option>
                ))}
              </select>
            </HmsField>
            <div className="sm:col-span-2 space-y-3">
              <HmsAlert message={error} />
              <div className="flex gap-2">
                <button type="submit" className={hmsButton.primary} disabled={busy}>
                  {busy ? "Adding…" : "Add staff"}
                </button>
                <button type="button" className={hmsButton.secondary} onClick={() => setShowForm(false)}>
                  Cancel
                </button>
              </div>
            </div>
          </form>
        </HmsCard>
      ) : null}

      <HmsCard
        flush
        title={`${shown.length} ${shown.length === 1 ? "person" : "people"}`}
        icon={Users}
        meaning="team"
        actions={
          showForm ? null : (
            <button type="button" className={hmsButton.primary} onClick={() => setShowForm(true)}>
              <UserPlus className="h-4 w-4" aria-hidden /> Add staff
            </button>
          )
        }
      >
        <div className="flex flex-wrap gap-2 px-3 pb-3 sm:px-6">
          <label className="sr-only" htmlFor="staff-search">
            Search staff
          </label>
          <input id="staff-search" className={`${hmsInput} max-w-xs`} placeholder="Search by name, number or job" value={query} onChange={(e) => setQuery(e.target.value)} />
          <label className="sr-only" htmlFor="staff-dept">
            Department
          </label>
          <select id="staff-dept" className={`${hmsInput} max-w-[14rem]`} value={dept} onChange={(e) => setDept(e.target.value)}>
            <option value="">All departments</option>
            {departments.map((d) => (
              <option key={d}>{d}</option>
            ))}
          </select>
          <label className="inline-flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={showLeft} onChange={(e) => setShowLeft(e.target.checked)} /> Show people who have left
          </label>
        </div>
        {shown.length === 0 ? (
          <HmsEmptyState bare icon={Users} meaning="team" title="No staff yet" description="Add everyone who works at the hotel, with or without a XYVOO login." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="border-y border-slate-100 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2 sm:px-6">Name</th>
                  <th className="px-3 py-2">Job</th>
                  <th className="px-3 py-2">Department</th>
                  <th className="px-3 py-2">Type</th>
                  <th className="px-3 py-2">Clock PIN</th>
                  <th className="px-3 py-2">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {shown.map((e) => (
                  <tr key={e.id}>
                    <td className="px-3 py-2 sm:px-6">
                      <Link href={`/hms/${slug}/hr/staff/${e.id}`} className="font-semibold text-slate-900 hover:underline">
                        {e.fullName}
                      </Link>
                      <span className="block text-xs text-slate-500">{e.employeeNumber}</span>
                    </td>
                    <td className="px-3 py-2 text-slate-700">{e.jobTitle ?? "—"}</td>
                    <td className="px-3 py-2 text-slate-700">{e.department ?? "—"}</td>
                    <td className="px-3 py-2 text-slate-700">{EMPLOYMENT_TYPE_LABEL[e.employmentType]}</td>
                    <td className="px-3 py-2">{e.hasPin ? <HmsPill tone="green">Set</HmsPill> : <HmsPill tone="amber">Not set</HmsPill>}</td>
                    <td className="px-3 py-2">
                      <HmsPill tone={e.status === "active" ? "green" : e.status === "left" ? "slate" : "red"}>{EMPLOYEE_STATUS_LABEL[e.status]}</HmsPill>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </HmsCard>
    </div>
  );
}

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ClipboardList } from "lucide-react";
import HMSLayout from "@/components/hms/HMSLayout";
import { HmsCard, HmsEmptyState, HmsPage, HmsPageHeader, hmsButton, hmsInput } from "@/components/hms/hms-ui";
import { getHmsAccessContext } from "@/lib/hms/access";
import { getHotelTenantBySlug } from "@/lib/hms/data";
import { getDepartmentLoginsForTenant } from "@/lib/hms/department-logins";
import { CREATABLE_DEPARTMENT_ROLES } from "@/lib/hms/role-sections";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Activity" };

type Row = {
  id: string;
  created_at: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  actor_user_id: string | null;
  actor_name?: string | null;
  approver_name?: string | null;
  department?: string | null;
  device?: string | null;
  after_state: Record<string, unknown> | null;
};

const label = (s: string) => s.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());

/** Who did what, when, and who approved it. Owners and admins see everyone; a head of department their own department. */
export default async function ActivityPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const one = (k: string) => (typeof sp[k] === "string" && sp[k] ? (sp[k] as string) : "");
  const access = await getHmsAccessContext(slug);
  if (access.userId && access.staffLevel === "staff" && !access.canAccessAllDepartments) redirect(access.homePath);

  const tenant = await getHotelTenantBySlug(slug);
  const isAdmin = access.canAccessAllDepartments;
  // A head of department only ever sees their own department, whatever the address says.
  const department = isAdmin ? one("department") : (access.departmentRole ?? "");
  const person = one("person");
  const action = one("action");
  const from = one("from");
  const to = one("to");

  let rows: Row[] = [];
  let actions: string[] = [];
  let people: { userId: string; fullName: string; departmentRole: string }[] = [];
  if (tenant) {
    const service = createServerSupabaseClient();
    const logins = await getDepartmentLoginsForTenant(tenant.id, { includeSuspended: true });
    people = logins.filter((l) => isAdmin || l.departmentRole === access.departmentRole);

    const build = (columns: string, byDepartment: boolean) => {
      let q = service.schema("hotel").from("audit_logs").select(columns).eq("tenant_id", tenant.id);
      if (byDepartment && department) q = q.eq("department", department);
      if (person) q = q.eq("actor_user_id", person);
      if (action) q = q.eq("action", action);
      if (from) q = q.gte("created_at", `${from}T00:00:00`);
      if (to) q = q.lte("created_at", `${to}T23:59:59`);
      return q.order("created_at", { ascending: false }).limit(200);
    };
    const full = await build(
      "id, created_at, action, entity_type, entity_id, actor_user_id, actor_name, approver_name, department, device, after_state",
      true,
    );
    if (!full.error) rows = (full.data ?? []) as unknown as Row[];
    else if (isAdmin) {
      // Before the activity-log migration: the original columns only (a head of department sees nothing until it runs).
      const legacy = await build("id, created_at, action, entity_type, entity_id, actor_user_id, after_state", false);
      rows = (legacy.data ?? []) as unknown as Row[];
    }
    const recent = await service
      .schema("hotel")
      .from("audit_logs")
      .select("action")
      .eq("tenant_id", tenant.id)
      .order("created_at", { ascending: false })
      .limit(1000);
    actions = [...new Set((recent.data ?? []).map((r) => r.action as string))].sort();
  }
  const nameOf = new Map(people.map((p) => [p.userId, p.fullName]));

  return (
    <HMSLayout slug={slug} requiredSection="activity">
      <HmsPage wide>
        <HmsPageHeader
          eyebrow={isAdmin ? "Hotel" : access.roleLabel}
          meaning="team"
          title="Activity"
          description="Who did what, when, and who approved it."
        />
        <form method="get" className="mb-4 grid grid-cols-1 gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-6">
          <label className="text-sm">
            <span className="mb-1 block font-medium text-slate-700">Person</span>
            <select name="person" defaultValue={person} className={hmsInput}>
              <option value="">Everyone</option>
              {people.map((p) => (
                <option key={p.userId} value={p.userId}>
                  {p.fullName}
                </option>
              ))}
            </select>
          </label>
          {isAdmin ? (
            <label className="text-sm">
              <span className="mb-1 block font-medium text-slate-700">Department</span>
              <select name="department" defaultValue={department} className={hmsInput}>
                <option value="">All</option>
                {CREATABLE_DEPARTMENT_ROLES.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <label className="text-sm">
            <span className="mb-1 block font-medium text-slate-700">Action</span>
            <select name="action" defaultValue={action} className={hmsInput}>
              <option value="">All</option>
              {actions.map((a) => (
                <option key={a} value={a}>
                  {label(a)}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium text-slate-700">From</span>
            <input type="date" name="from" defaultValue={from} className={hmsInput} />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium text-slate-700">To</span>
            <input type="date" name="to" defaultValue={to} className={hmsInput} />
          </label>
          <div className="flex items-end gap-2">
            <button type="submit" className={hmsButton.primary}>
              Filter
            </button>
            <a href={`/hms/${slug}/activity`} className={hmsButton.secondary}>
              Clear
            </a>
          </div>
        </form>

        {rows.length === 0 ? (
          <HmsEmptyState icon={ClipboardList} meaning="team" title="Nothing logged yet" description="Actions your team takes will appear here as they happen." />
        ) : (
          <HmsCard flush>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <caption className="sr-only">Recent activity, newest first</caption>
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-left">
                    {["When", "Who", "Department", "What", "Approved by"].map((h) => (
                      <th key={h} scope="col" className="px-4 py-3 font-semibold text-slate-700">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {rows.map((r) => (
                    <tr key={r.id}>
                      <td className="whitespace-nowrap px-4 py-2.5 text-slate-700">
                        {new Date(r.created_at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                      </td>
                      <td className="px-4 py-2.5 font-medium text-slate-900">
                        {r.actor_name ||
                          (r.actor_user_id ? nameOf.get(r.actor_user_id) : null) ||
                          (r.after_state?._actor_name as string | undefined) ||
                          "—"}
                      </td>
                      <td className="px-4 py-2.5 text-slate-700">{r.department || "—"}</td>
                      <td className="px-4 py-2.5 text-slate-900">
                        {label(r.action)}
                        <span className="ml-2 text-xs text-slate-500">{label(r.entity_type)}</span>
                      </td>
                      <td className="px-4 py-2.5 text-slate-700">
                        {r.approver_name || (r.after_state?._approver_name as string | undefined) || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </HmsCard>
        )}
      </HmsPage>
    </HMSLayout>
  );
}

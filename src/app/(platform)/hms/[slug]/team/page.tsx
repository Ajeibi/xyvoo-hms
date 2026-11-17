import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Activity } from "lucide-react";
import HMSLayout from "@/components/hms/HMSLayout";
import DepartmentAccessSetup from "@/components/hms/DepartmentAccessSetup";
import ApprovalPinCard from "@/components/hms/ApprovalPinCard";
import { HmsCard, HmsPage, HmsPageHeader } from "@/components/hms/hms-ui";
import { getHmsAccessContext } from "@/lib/hms/access";
import { getHotelTenantBySlug } from "@/lib/hms/data";
import { getDepartmentLoginsBySlug } from "@/lib/hms/department-logins";
import { listLinkableEmployees } from "@/lib/hms/hr-link";
import { teamWorkload } from "@/lib/hms/my-work";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "My team" };

const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "No activity";

/** A head of department's own team: add staff, suspend them, reset a password. Owners and admins do this in Settings. */
export default async function TeamPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const access = await getHmsAccessContext(slug);
  // Owners and admins manage every department from Settings; staff have no team to manage.
  if (access.userId && (access.isOwnerOrAdmin || access.canAccessAllDepartments)) redirect(`/hms/${slug}/settings#staff-access-setup`);
  if (access.userId && access.staffLevel === "staff") redirect(access.homePath);

  const logins = access.departmentRole ? (await getDepartmentLoginsBySlug(slug, { includeSuspended: true })).filter((l) => l.departmentRole === access.departmentRole) : [];

  const tenant = await getHotelTenantBySlug(slug);
  const service = createServerSupabaseClient();
  const [hrEmployees, workload] = tenant
    ? await Promise.all([
        listLinkableEmployees(service, tenant.id, access.departmentRole),
        teamWorkload(service, tenant.id, logins.filter((l) => l.status === "active").map((l) => l.userId)).catch(() => new Map()),
      ])
    : [[], new Map()];
  const active = logins.filter((l) => l.status === "active");

  return (
    <HMSLayout slug={slug} requiredSection="team">
      <HmsPage>
        <HmsPageHeader
          eyebrow={access.roleLabel}
          meaning="team"
          title="My team"
          description="Give each person their own login so every action is tracked to them."
        />
        <ApprovalPinCard slug={slug} />
        {active.length > 0 ? (
          <HmsCard title="Who is doing what" description="Open work given to each person, and what they did in the last 7 days." icon={Activity} meaning="team">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[32rem] text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                    <th className="py-2 pr-3 font-medium">Person</th>
                    <th className="py-2 pr-3 font-medium">Open rooms</th>
                    <th className="py-2 pr-3 font-medium">Open requests</th>
                    <th className="py-2 pr-3 font-medium">Actions (7 days)</th>
                    <th className="py-2 font-medium">Last action</th>
                  </tr>
                </thead>
                <tbody>
                  {active.map((l) => {
                    const w = workload.get(l.userId);
                    return (
                      <tr key={l.userId} className="border-b border-slate-100 last:border-0">
                        <td className="py-2 pr-3 font-medium text-slate-900">
                          {l.fullName} <span className="text-xs font-normal text-slate-500">{l.staffLevel === "hod" ? "HOD" : "Staff"}</span>
                        </td>
                        <td className="py-2 pr-3">{w?.housekeeping ?? 0}</td>
                        <td className="py-2 pr-3">{w?.guestRequests ?? 0}</td>
                        <td className="py-2 pr-3">{w?.actionsLast7Days ?? 0}</td>
                        <td className="py-2 text-slate-600">{when(w?.lastActionAt ?? null)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </HmsCard>
        ) : null}
        <DepartmentAccessSetup slug={slug} initialDepartmentLogins={logins} isAdmin={false} department={access.departmentRole} hrEmployees={hrEmployees} />
      </HmsPage>
    </HMSLayout>
  );
}

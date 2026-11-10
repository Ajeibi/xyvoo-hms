import Link from "next/link";
import { notFound } from "next/navigation";
import HMSLayout from "@/components/hms/HMSLayout";
import { HmsPage, HmsPageHeader, hmsButton } from "@/components/hms/hms-ui";
import { EmployeeClient } from "@/components/hms/hr/EmployeeClient";
import { HrSubNav } from "@/components/hms/hr/hr-ui";
import { getDepartmentLoginsForTenant } from "@/lib/hms/department-logins";
import { getEmployee, getEmployeePrivate, getPayProfile, listDocuments } from "@/lib/hms/hr/hr-employees";
import { loadHrPage } from "@/lib/hms/hr/hr-page";
import { getHrSettings } from "@/lib/hms/hr/hr-settings";
import { EmployeeExtras } from "@/components/hms/hr/EmployeeExtras";

export default async function HrEmployeePage({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const ctx = await loadHrPage(slug);
  if (!ctx) notFound();
  const employee = await getEmployee(ctx.service, ctx.tenantId, id);
  if (!employee) notFound();

  const [settings, logins, details, pay, documents] = await Promise.all([
    getHrSettings(ctx.service, ctx.tenantId),
    getDepartmentLoginsForTenant(ctx.tenantId),
    // Read with the signed-in user's own token: the database returns nothing unless they may see it.
    ctx.canSeePrivate ? getEmployeePrivate(ctx.privateDb, ctx.tenantId, id) : Promise.resolve(null),
    ctx.canSeePrivate ? getPayProfile(ctx.privateDb, ctx.tenantId, id) : Promise.resolve(null),
    ctx.canSeePrivate ? listDocuments(ctx.privateDb, ctx.tenantId, id) : Promise.resolve([]),
  ]);

  return (
    <HMSLayout slug={slug} requiredSection="hr">
      <HmsPage wide>
        <HmsPageHeader
          eyebrow="HR · Staff"
          meaning="team"
          title={employee.fullName}
          description={[employee.jobTitle, employee.department, employee.employeeNumber].filter(Boolean).join(" · ")}
          actions={
            <Link href={`/hms/${slug}/hr/staff`} className={hmsButton.secondary}>
              All staff
            </Link>
          }
        />
        <HrSubNav slug={slug} />
        <EmployeeClient
          slug={slug}
          employee={employee}
          departments={settings.departments}
          logins={logins.map((l) => ({ userId: l.userId, label: `${l.fullName} (${l.departmentRole})` }))}
          canSeePrivate={ctx.canSeePrivate}
          details={details}
          pay={pay}
          documents={documents}
          payrollSwitches={{ pensionEnabled: settings.pensionEnabled, nsitfEnabled: settings.nsitfEnabled, itfEnabled: settings.itfEnabled }}
        />
        <EmployeeExtras slug={slug} tenantId={ctx.tenantId} employeeId={id} />
      </HmsPage>
    </HMSLayout>
  );
}

import HMSLayout from "@/components/hms/HMSLayout";
import { HmsPage, HmsPageHeader } from "@/components/hms/hms-ui";
import { StaffClient } from "@/components/hms/hr/StaffClient";
import { HrSubNav } from "@/components/hms/hr/hr-ui";
import { getDepartmentLoginsForTenant } from "@/lib/hms/department-logins";
import { listEmployees } from "@/lib/hms/hr/hr-employees";
import { loadHrPage } from "@/lib/hms/hr/hr-page";
import { getHrSettings } from "@/lib/hms/hr/hr-settings";

export default async function HrStaffPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ new?: string }> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const ctx = await loadHrPage(slug);
  const header = <HmsPageHeader eyebrow="HR" meaning="team" title="Staff" description="Everyone who works at the hotel, with or without a XYVOO login." />;
  if (!ctx) {
    return (
      <HMSLayout slug={slug} requiredSection="hr">
        <HmsPage>{header}</HmsPage>
      </HMSLayout>
    );
  }
  const [employees, settings, logins] = await Promise.all([
    listEmployees(ctx.service, ctx.tenantId),
    getHrSettings(ctx.service, ctx.tenantId),
    getDepartmentLoginsForTenant(ctx.tenantId),
  ]);
  return (
    <HMSLayout slug={slug} requiredSection="hr">
      <HmsPage wide>
        {header}
        <HrSubNav slug={slug} />
        <StaffClient
          slug={slug}
          employees={employees}
          departments={settings.departments}
          logins={logins.map((l) => ({ userId: l.userId, label: `${l.fullName} (${l.departmentRole})` }))}
          startOpen={sp.new === "1"}
        />
      </HmsPage>
    </HMSLayout>
  );
}

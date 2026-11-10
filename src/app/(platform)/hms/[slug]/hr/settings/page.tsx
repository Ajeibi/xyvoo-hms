import { headers } from "next/headers";
import { notFound } from "next/navigation";
import HMSLayout from "@/components/hms/HMSLayout";
import { HmsPage, HmsPageHeader } from "@/components/hms/hms-ui";
import { HrSettingsClient } from "@/components/hms/hr/HrSettingsClient";
import { HrSubNav } from "@/components/hms/hr/hr-ui";
import { loadHrPage } from "@/lib/hms/hr/hr-page";
import { listTemplates } from "@/lib/hms/hr/hr-rota";
import { getHrSettings, listAccessGrants, listGrantableLogins, listLeaveTypes } from "@/lib/hms/hr/hr-settings";

export default async function HRSettingsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await loadHrPage(slug);
  if (!ctx) notFound();
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const [settings, leaveTypes, templates, logins, grants] = await Promise.all([
    getHrSettings(ctx.service, ctx.tenantId),
    listLeaveTypes(ctx.service, ctx.tenantId),
    listTemplates(ctx.service, ctx.tenantId),
    listGrantableLogins(ctx.service, ctx.tenantId),
    listAccessGrants(ctx.service, ctx.tenantId),
  ]);

  return (
    <HMSLayout slug={slug} requiredSection="hr-settings">
      <HmsPage wide>
        <HmsPageHeader eyebrow="HR" meaning="team" title="HR settings" description="Rota rules, the clock screen, leave, payroll and who can see pay." />
        <HrSubNav slug={slug} />
        <HrSettingsClient
          slug={slug}
          settings={settings}
          leaveTypes={leaveTypes}
          templates={templates}
          logins={logins}
          grants={grants}
          isOwner={ctx.isOwner}
          origin={host ? `${proto}://${host}` : ""}
        />
      </HmsPage>
    </HMSLayout>
  );
}

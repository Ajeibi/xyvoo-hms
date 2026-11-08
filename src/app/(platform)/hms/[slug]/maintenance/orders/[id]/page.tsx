import Link from "next/link";
import HMSLayout from "@/components/hms/HMSLayout";
import { HmsPage, HmsPageHeader, hmsButton } from "@/components/hms/hms-ui";
import { MaintenanceSubNav } from "@/components/hms/maintenance/maint-ui";
import { WorkOrderDetailClient } from "@/components/hms/maintenance/WorkOrderDetailClient";
import { getHmsAccessContext } from "@/lib/hms/access";
import { getHotelTenantBySlug } from "@/lib/hms/data";
import { listItems, listLocations } from "@/lib/hms/inventory-items";
import { getWorkOrder } from "@/lib/hms/maintenance-orders";
import { listTechnicians } from "@/lib/hms/maintenance-settings";
import { getMaintenanceCapabilities } from "@/lib/hms/maintenance-rbac";
import { normalizePricingSetup } from "@/lib/hms/room-pricing";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export default async function MaintenanceOrderPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; id: string }>;
  searchParams: Promise<{ finish?: string }>;
}) {
  const { slug, id } = await params;
  const sp = await searchParams;
  const [tenant, access] = await Promise.all([getHotelTenantBySlug(slug), getHmsAccessContext(slug)]);
  const caps = getMaintenanceCapabilities({ membershipRole: access.role, departmentRole: access.departmentRole });
  const service = createServerSupabaseClient();
  const detail = tenant ? await getWorkOrder(service, tenant.id, id) : null;

  if (!tenant || !detail) {
    return (
      <HMSLayout slug={slug} requiredSection="maintenance">
        <HmsPage>
          <HmsPageHeader eyebrow="Maintenance" meaning="care" title="Work order not found" actions={<Link href={`/hms/${slug}/maintenance/orders`} className={hmsButton.secondary}>Back to work orders</Link>} />
        </HmsPage>
      </HMSLayout>
    );
  }

  const { workOrder: wo } = detail;
  const [technicians, items, stores, blocks, unit] = await Promise.all([
    listTechnicians(service, tenant.id, { activeOnly: true }),
    caps.canManage ? listItems(service, tenant.id, { activeOnly: true, excludeFixedAssets: true }) : Promise.resolve([]),
    caps.canManage ? listLocations(service, tenant.id) : Promise.resolve([]),
    wo.roomUnitId && !wo.roomBlockId
      ? service.schema("hotel").from("room_blocks").select("id, reason, start_at").eq("tenant_id", tenant.id).eq("room_unit_id", wo.roomUnitId).eq("active", true).neq("block_type", "soft")
      : Promise.resolve({ data: [] }),
    wo.roomUnitId ? service.schema("hotel").from("room_units").select("status").eq("id", wo.roomUnitId).maybeSingle() : Promise.resolve({ data: null }),
  ]);

  return (
    <HMSLayout slug={slug} requiredSection="maintenance">
      <HmsPage>
        <HmsPageHeader
          eyebrow="Maintenance"
          meaning="care"
          title={wo.woNumber}
          description="Everything about this job in one place."
          actions={
            <Link href={`/hms/${slug}/maintenance/orders`} className={hmsButton.secondary}>
              All work orders
            </Link>
          }
        />
        <MaintenanceSubNav slug={slug} />
        <WorkOrderDetailClient
          slug={slug}
          wo={wo}
          events={detail.events}
          parts={detail.parts}
          technicians={technicians}
          items={items.map((i) => ({ id: String(i.id), label: `${i.name} (${i.sku})` }))}
          stores={stores.map((s) => ({ id: String(s.id), label: String(s.name) }))}
          adoptable={((blocks.data ?? []) as { id: string; reason: string; start_at: string }[]).map((b) => ({ id: b.id, reason: b.reason, since: b.start_at }))}
          roomStatus={(unit.data as { status?: string } | null)?.status ?? null}
          currency={normalizePricingSetup(tenant.pricing_setup).currency}
          canManage={caps.canManage}
          startFinishing={sp.finish === "1"}
        />
      </HmsPage>
    </HMSLayout>
  );
}

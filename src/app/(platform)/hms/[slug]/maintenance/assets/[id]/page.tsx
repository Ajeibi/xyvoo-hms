import Link from "next/link";
import HMSLayout from "@/components/hms/HMSLayout";
import { HmsCard, HmsEmptyState, HmsPage, HmsPageHeader, HmsPill, hmsButton } from "@/components/hms/hms-ui";
import { MaintenanceSubNav, PriorityPill, StatusPill } from "@/components/hms/maintenance/maint-ui";
import { getHotelTenantBySlug } from "@/lib/hms/data";
import { getAsset } from "@/lib/hms/maintenance-assets";
import { listWorkOrders } from "@/lib/hms/maintenance-orders";
import { listSchedules } from "@/lib/hms/maintenance-schedules";
import { describeInterval, formatDateTime, formatMinutes, money } from "@/lib/hms/maintenance-shared";
import { normalizePricingSetup } from "@/lib/hms/room-pricing";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export default async function AssetHistoryPage({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const tenant = await getHotelTenantBySlug(slug);
  const service = createServerSupabaseClient();
  const asset = tenant ? await getAsset(service, tenant.id, id) : null;

  if (!tenant || !asset) {
    return (
      <HMSLayout slug={slug} requiredSection="maintenance">
        <HmsPage>
          <HmsPageHeader eyebrow="Maintenance" meaning="care" title="Equipment not found" actions={<Link href={`/hms/${slug}/maintenance/assets`} className={hmsButton.secondary}>Back to equipment</Link>} />
        </HmsPage>
      </HMSLayout>
    );
  }

  const [orders, schedules] = await Promise.all([listWorkOrders(service, tenant.id, { assetId: id, status: "all" }), listSchedules(service, tenant.id)]);
  const mine = schedules.filter((s) => s.assetId === id);
  const currency = normalizePricingSetup(tenant.pricing_setup).currency;
  const live = orders.filter((o) => o.status !== "cancelled");
  const partsCost = live.reduce((s, o) => s + o.partsCost, 0);
  const labour = live.reduce((s, o) => s + o.labourMinutes, 0);

  return (
    <HMSLayout slug={slug} requiredSection="maintenance">
      <HmsPage>
        <HmsPageHeader
          eyebrow="Maintenance"
          meaning="care"
          title={asset.name}
          description={`${asset.assetTag} · ${asset.roomCode ? `Room ${asset.roomCode}` : (asset.locationText ?? "No location")}`}
          actions={
            <>
              <Link href={`/hms/${slug}/maintenance/assets`} className={hmsButton.secondary}>
                All equipment
              </Link>
              <Link href={`/hms/${slug}/maintenance/orders?new=1&assetId=${asset.id}`} className={hmsButton.primary}>
                Report a fault
              </Link>
            </>
          }
        />
        <MaintenanceSubNav slug={slug} />
        <HmsCard title="Details">
          <dl className="grid gap-3 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-slate-500">Make and model</dt>
              <dd className="text-slate-900">{[asset.make, asset.model].filter(Boolean).join(" ") || "Not set"}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Serial number</dt>
              <dd className="text-slate-900">{asset.serialNumber ?? "Not set"}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Installed</dt>
              <dd className="text-slate-900">{asset.installedOn ?? "Not set"}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Warranty</dt>
              <dd className="text-slate-900">{asset.warrantyUntil ? `Until ${asset.warrantyUntil}` : "None recorded"}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Total spent</dt>
              <dd className="text-slate-900">
                {money(partsCost, currency)} parts · {formatMinutes(labour)} labour
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">Status</dt>
              <dd className="text-slate-900">{asset.status.replace(/_/g, " ")}</dd>
            </div>
          </dl>
          {asset.notes ? <p className="mt-3 text-sm text-slate-700">{asset.notes}</p> : null}
        </HmsCard>

        {mine.length > 0 ? (
          <HmsCard title="Planned servicing">
            <ul className="space-y-1 text-sm">
              {mine.map((s) => (
                <li key={s.id} className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-slate-900">{s.title}</span>
                  <HmsPill tone={s.active ? "blue" : "slate"}>{s.active ? describeInterval(s.everyN, s.unit) : "Paused"}</HmsPill>
                  <span className="text-slate-600">next due {s.nextDue}</span>
                </li>
              ))}
            </ul>
          </HmsCard>
        ) : null}

        <HmsCard flush title="History" description="Every work order raised for this equipment, newest first.">
          {orders.length === 0 ? (
            <HmsEmptyState bare title="No repairs recorded" description="Work orders raised for this equipment will appear here." />
          ) : (
            <ul className="divide-y divide-slate-100">
              {orders.map((o) => (
                <li key={o.id} className="px-3 py-3 sm:px-6">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link href={`/hms/${slug}/maintenance/orders/${o.id}`} className="font-semibold text-slate-900 hover:underline">
                      {o.title}
                    </Link>
                    <PriorityPill priority={o.priority} />
                    <StatusPill status={o.status} />
                  </div>
                  <p className="text-sm text-slate-600">
                    {o.woNumber} · raised {formatDateTime(o.createdAt)}
                    {o.completedAt ? ` · fixed ${formatDateTime(o.completedAt)}` : ""}
                    {o.partsCost ? ` · ${money(o.partsCost, currency)} parts` : ""}
                    {o.technicianName ? ` · ${o.technicianName}` : ""}
                  </p>
                  {o.resolutionNotes ? <p className="text-sm text-slate-700">{o.resolutionNotes}</p> : null}
                </li>
              ))}
            </ul>
          )}
        </HmsCard>
      </HmsPage>
    </HMSLayout>
  );
}

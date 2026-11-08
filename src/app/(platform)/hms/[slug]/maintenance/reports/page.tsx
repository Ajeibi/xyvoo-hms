import Link from "next/link";
import HMSLayout from "@/components/hms/HMSLayout";
import { HmsCard, HmsEmptyState, HmsPage, HmsPageHeader, HmsStatStrip, HmsStatTile, hmsButton, hmsInput } from "@/components/hms/hms-ui";
import { MaintenanceSubNav } from "@/components/hms/maintenance/maint-ui";
import { getHotelTenantBySlug } from "@/lib/hms/data";
import { loadReport, type ReportRow } from "@/lib/hms/maintenance-page";
import { SOURCE_LABEL, type WoSource, formatMinutes, money } from "@/lib/hms/maintenance-shared";
import { normalizePricingSetup } from "@/lib/hms/room-pricing";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { CheckCircle2, ClipboardList, Gauge, Wallet } from "lucide-react";

const isDate = (v: string | undefined) => Boolean(v && /^\d{4}-\d{2}-\d{2}$/.test(v));

function Table({ title, rows, currency, empty }: { title: string; rows: ReportRow[]; currency: string; empty: string }) {
  return (
    <HmsCard flush title={title}>
      {rows.length === 0 ? (
        <p className="px-3 py-4 text-sm text-slate-600 sm:px-6">{empty}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th scope="col" className="px-3 py-2 sm:px-6">Name</th>
                <th scope="col" className="px-3 py-2 text-right">Orders</th>
                <th scope="col" className="px-3 py-2 text-right">Avg hours to fix</th>
                <th scope="col" className="px-3 py-2 text-right">Parts</th>
                <th scope="col" className="px-3 py-2 text-right sm:pr-6">Labour</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => (
                <tr key={r.label}>
                  <th scope="row" className="px-3 py-2 font-medium text-slate-900 sm:px-6">{r.label}</th>
                  <td className="px-3 py-2 text-right tabular-nums">{r.orders}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.avgHours === null ? "–" : r.avgHours}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{money(r.partsCost, currency)}</td>
                  <td className="px-3 py-2 text-right tabular-nums sm:pr-6">{formatMinutes(r.labourMinutes)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </HmsCard>
  );
}

export default async function MaintenanceReportsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const tenant = await getHotelTenantBySlug(slug);
  if (!tenant) {
    return (
      <HMSLayout slug={slug} requiredSection="maintenance">
        <HmsPage>
          <HmsPageHeader eyebrow="Maintenance" meaning="care" title="Maintenance reports" description="Hotel not found." />
        </HmsPage>
      </HMSLayout>
    );
  }
  const now = new Date();
  const to = isDate(sp.to) ? (sp.to as string) : now.toISOString().slice(0, 10);
  const monthAgo = new Date(now);
  monthAgo.setUTCDate(monthAgo.getUTCDate() - 30);
  const from = isDate(sp.from) ? (sp.from as string) : monthAgo.toISOString().slice(0, 10);
  const currency = normalizePricingSetup(tenant.pricing_setup).currency;
  const r = await loadReport(createServerSupabaseClient(), tenant.id, from, to);

  return (
    <HMSLayout slug={slug} requiredSection="maintenance">
      <HmsPage wide>
        <HmsPageHeader eyebrow="Maintenance" meaning="care" title="Maintenance reports" description="Where faults happen, how fast they are fixed, and what they cost." />
        <MaintenanceSubNav slug={slug} />
        <form className="flex flex-wrap items-end gap-3" action={`/hms/${slug}/maintenance/reports`}>
          <div>
            <label htmlFor="r-from" className="mb-1 block text-xs font-medium text-slate-600">From</label>
            <input id="r-from" name="from" type="date" defaultValue={from} className={hmsInput} />
          </div>
          <div>
            <label htmlFor="r-to" className="mb-1 block text-xs font-medium text-slate-600">To</label>
            <input id="r-to" name="to" type="date" defaultValue={to} className={hmsInput} />
          </div>
          <button type="submit" className={hmsButton.secondary}>Show</button>
        </form>

        <HmsStatStrip label="Report figures">
          <HmsStatTile label="Jobs raised" value={r.total} hint={`${r.completed} completed`} icon={ClipboardList} meaning="care" />
          <HmsStatTile label="Average time to fix" value={r.avgFixHours === null ? "No data" : `${r.avgFixHours}h`} icon={Gauge} meaning="care" />
          <HmsStatTile label="Fixed on time" value={r.slaKeptPercent === null ? "No data" : `${r.slaKeptPercent}%`} icon={CheckCircle2} meaning="care" />
          <HmsStatTile label="Parts and labour" value={money(r.partsCost, currency)} hint={`${formatMinutes(r.labourMinutes)} of labour`} icon={Wallet} meaning="money" />
        </HmsStatStrip>

        {r.total === 0 ? (
          <HmsEmptyState icon={ClipboardList} meaning="care" title="No jobs in this period" description="Pick a longer period, or raise work orders to see figures here." action={<Link href={`/hms/${slug}/maintenance/orders?new=1`} className={hmsButton.primary}>Report a fault</Link>} />
        ) : (
          <>
            {r.repeatRooms.length > 0 ? (
              <HmsCard title="Repeat faults" description="Rooms with several orders in this period. They may need a proper fix, not another patch.">
                <ul className="space-y-1 text-sm">
                  {r.repeatRooms.map((x) => (
                    <li key={x.label}>
                      <strong>{x.label}</strong>: {x.orders} orders
                    </li>
                  ))}
                </ul>
              </HmsCard>
            ) : null}
            <div className="grid gap-4 lg:grid-cols-2">
              <Table title="By type of problem" rows={r.byCategory} currency={currency} empty="No jobs." />
              <Table title="By technician" rows={r.byTechnician} currency={currency} empty="No jobs." />
              <Table title="By room" rows={r.byRoom} currency={currency} empty="No jobs in guest rooms." />
              <Table title="By equipment" rows={r.byAsset} currency={currency} empty="No jobs on registered equipment." />
            </div>
            <HmsCard title="Where jobs came from">
              <ul className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
                {r.bySource.map((s) => (
                  <li key={s.label}>
                    {SOURCE_LABEL[s.label as WoSource] ?? s.label}: <strong>{s.orders}</strong>
                  </li>
                ))}
              </ul>
            </HmsCard>
          </>
        )}
      </HmsPage>
    </HMSLayout>
  );
}

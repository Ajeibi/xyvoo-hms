import Link from "next/link";
import { BedDouble, CalendarCheck, DoorOpen, Hotel, LogOut, TrendingUp, Wallet } from "lucide-react";
import { HmsCard, HmsEmptyState, HmsPage, HmsPageHeader, HmsStatStrip, HmsStatTile, hmsButton } from "@/components/hms/hms-ui";
import { listUserPlaces } from "@/lib/hms/groups/group-access";
import { loadGroupFigures } from "@/lib/hms/groups/group-dashboard";
import { requireGroupPage } from "@/lib/hms/groups/group-page";
import { formatMoney } from "@/lib/hms/reports/model";

export const metadata = { title: "Overview" };

const pct = (v: number | null) => (v == null ? "—" : `${v}%`);

export default async function GroupDashboardPage({ params }: { params: Promise<{ groupSlug: string }> }) {
  const { groupSlug } = await params;
  const ctx = await requireGroupPage(groupSlug);
  const [figures, places] = await Promise.all([loadGroupFigures(ctx.userDb, ctx.hotels), listUserPlaces(ctx.userId)]);
  const memberOf = new Set(places.filter((p) => p.kind === "hotel").map((p) => p.slug));
  const cur = ctx.group.baseCurrency;
  const t = figures.totalStatus;
  const occToday = t.roomCount > 0 ? Math.round((t.inHouse / t.roomCount) * 1000) / 10 : null;

  return (
    <HmsPage wide>
      <HmsPageHeader
        eyebrow="Hotel group"
        title="Today across the group"
        description="Every hotel's day so far and month to date, worked out the same way as each hotel's own reports."
        actions={
          <Link href={`/hms-group/${groupSlug}/reports`} className={hmsButton.secondary}>
            Reports and exports
          </Link>
        }
      />

      {ctx.hotels.length < 2 ? (
        <HmsEmptyState
          icon={Hotel}
          title="This group has one hotel"
          description="Invite your other hotels to see them side by side here. Each hotel's owner accepts the invitation."
          action={
            ctx.isOwner ? (
              <Link href={`/hms-group/${groupSlug}/settings`} className={hmsButton.primary}>
                Invite a hotel
              </Link>
            ) : undefined
          }
        />
      ) : null}

      <HmsStatStrip label="Group today">
        <HmsStatTile label="In house" value={`${t.inHouse} of ${t.roomCount} rooms`} hint={`Occupancy now ${pct(occToday)}`} icon={BedDouble} meaning="rooms" />
        <HmsStatTile label="Arriving today" value={String(t.arrivalsToday)} icon={CalendarCheck} meaning="guests" />
        <HmsStatTile label="Leaving today" value={String(t.departuresToday)} icon={LogOut} meaning="guests" />
        <HmsStatTile label="Out of order" value={String(t.outOfOrder)} icon={DoorOpen} meaning="care" status={t.outOfOrder > 0 ? "warning" : undefined} statusText="Rooms off sale" />
      </HmsStatStrip>

      <HmsStatStrip label="Group month to date">
        <HmsStatTile label="Revenue, month to date" value={formatMoney(figures.totalPeriod.totalRevenue, cur)} icon={Wallet} meaning="money" />
        <HmsStatTile label="Occupancy, month to date" value={pct(figures.totalPeriod.occupancy)} hint={`${figures.totalPeriod.roomsSold} of ${figures.totalPeriod.roomsAvailable} room nights`} icon={TrendingUp} meaning="rooms" />
        <HmsStatTile label="ADR, month to date" value={figures.totalPeriod.adr == null ? "—" : formatMoney(figures.totalPeriod.adr, cur)} icon={Wallet} meaning="money" />
        <HmsStatTile label="RevPAR, month to date" value={figures.totalPeriod.revpar == null ? "—" : formatMoney(figures.totalPeriod.revpar, cur)} icon={Wallet} meaning="money" />
      </HmsStatStrip>

      <HmsCard id="by-hotel" title="By hotel" description="Group figures add the hotels' rooms and revenue together; they are never an average of percentages." flush>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-600">
              <tr>
                <th scope="col" className="px-4 py-3">Hotel</th>
                <th scope="col" className="px-4 py-3 text-right">In house</th>
                <th scope="col" className="px-4 py-3 text-right">Arriving</th>
                <th scope="col" className="px-4 py-3 text-right">Leaving</th>
                <th scope="col" className="px-4 py-3 text-right">Out of order</th>
                <th scope="col" className="px-4 py-3 text-right">Occupancy MTD</th>
                <th scope="col" className="px-4 py-3 text-right">ADR MTD</th>
                <th scope="col" className="px-4 py-3 text-right">Revenue MTD</th>
                <th scope="col" className="px-4 py-3">Last night audit</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {figures.hotels.map((h) => (
                <tr key={h.hotel.tenantId}>
                  <th scope="row" className="px-4 py-3 text-left font-medium text-slate-900">
                    {memberOf.has(h.hotel.slug) ? (
                      <Link href={`/hms/${h.hotel.slug}/dashboard`} className="text-blue-700 underline-offset-2 hover:underline">
                        {h.hotel.name}
                      </Link>
                    ) : (
                      h.hotel.name
                    )}
                    {!h.ok ? <span className="block text-xs font-normal text-red-700">Figures unavailable: {h.error}</span> : null}
                  </th>
                  <td className="px-4 py-3 text-right tabular-nums">{h.status ? `${h.status.inHouse} / ${h.status.roomCount}` : "—"}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{h.status?.arrivalsToday ?? "—"}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{h.status?.departuresToday ?? "—"}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{h.status?.outOfOrder ?? "—"}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{pct(h.period?.occupancy ?? null)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{h.period?.adr == null ? "—" : formatMoney(h.period.adr, cur)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{h.period ? formatMoney(h.period.totalRevenue, cur) : "—"}</td>
                  <td className="px-4 py-3">{h.status?.lastAuditDate ?? <span className="text-amber-800">Not run yet</span>}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-slate-50 font-semibold">
              <tr>
                <th scope="row" className="px-4 py-3 text-left">Group</th>
                <td className="px-4 py-3 text-right tabular-nums">{`${t.inHouse} / ${t.roomCount}`}</td>
                <td className="px-4 py-3 text-right tabular-nums">{t.arrivalsToday}</td>
                <td className="px-4 py-3 text-right tabular-nums">{t.departuresToday}</td>
                <td className="px-4 py-3 text-right tabular-nums">{t.outOfOrder}</td>
                <td className="px-4 py-3 text-right tabular-nums">{pct(figures.totalPeriod.occupancy)}</td>
                <td className="px-4 py-3 text-right tabular-nums">{figures.totalPeriod.adr == null ? "—" : formatMoney(figures.totalPeriod.adr, cur)}</td>
                <td className="px-4 py-3 text-right tabular-nums">{formatMoney(figures.totalPeriod.totalRevenue, cur)}</td>
                <td className="px-4 py-3" />
              </tr>
            </tfoot>
          </table>
        </div>
      </HmsCard>
    </HmsPage>
  );
}

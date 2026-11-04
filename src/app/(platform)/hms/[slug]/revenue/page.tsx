import Link from "next/link";
import { BedDouble, Ban, Sparkles, TrendingUp, Wallet } from "lucide-react";
import { HmsCard, HmsEmptyState, HmsStatStrip, HmsStatTile, hmsButton } from "@/components/hms/hms-ui";
import { RevenueShell } from "@/components/hms/revenue/RevenueShell";
import { getHotelTenantBySlug } from "@/lib/hms/data";
import { formatPricingAmount } from "@/lib/hms/room-pricing";
import { loadRateBook } from "@/lib/hms/rates/book";
import { addDays, priceStay } from "@/lib/hms/rates/pricing";
import { getForecastReport } from "@/lib/hms/reports/forecast";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export default async function RevenuePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const tenant = await getHotelTenantBySlug(slug);

  const body = async () => {
    if (!tenant) return <HmsEmptyState art="page" meaning="money" title="We couldn't find this hotel" description="Check the web address, or go back to your dashboard and try again." />;
    const db = createServerSupabaseClient();
    const book = await loadRateBook(db, tenant);
    const today = new Date().toISOString().slice(0, 10);
    const [forecast, suggestions] = await Promise.all([
      getForecastReport(db, tenant.id, book.currency).catch(() => null),
      db.schema("hotel").from("price_suggestions").select("id", { count: "exact", head: true }).eq("tenant_id", tenant.id).eq("status", "open"),
    ]);
    const next30 = forecast?.horizons.find((h) => h.days === 30)?.totals ?? null;
    const revpar = next30 && next30.available > 0 ? next30.revenue / next30.available : null;
    const inForce = book.restrictions.filter((r) => r.dateTo >= today && r.dateFrom <= addDays(today, 30));
    const plans = book.plans.filter((p) => p.active);
    const open = suggestions.count ?? 0;

    return (
      <>
        <HmsStatStrip label="Next 30 days">
          <HmsStatTile label="Occupancy" meaning="rooms" icon={BedDouble} value={next30?.occupancy != null ? `${next30.occupancy}%` : "No data"} hint="Rooms booked over the next 30 days" href={`/hms/${slug}/reports`} />
          <HmsStatTile label="Average room rate" meaning="money" icon={Wallet} value={next30?.adr != null ? formatPricingAmount(next30.adr, book.currency) : "No data"} hint="Per room night booked" />
          <HmsStatTile label="Revenue per available room" meaning="money" icon={TrendingUp} value={revpar != null ? formatPricingAmount(revpar, book.currency) : "No data"} hint="Booked revenue divided by every room, sold or not" />
          <HmsStatTile
            label="Price suggestions"
            meaning="attention"
            icon={Sparkles}
            value={String(open)}
            hint={open === 0 ? "Nothing to decide right now" : "Waiting for your decision"}
            href={`/hms/${slug}/revenue/suggestions`}
            status={open > 0 ? "warning" : undefined}
            statusText={`${open} to look at`}
          />
        </HmsStatStrip>

        <HmsCard
          id="todays-prices"
          icon={Wallet}
          meaning="money"
          title="Today's prices"
          description="What a night starting today costs on each plan, for two adults, before tax."
          actions={
            <Link href={`/hms/${slug}/revenue/calendar`} className={hmsButton.secondary}>
              Open the rates calendar
            </Link>
          }
        >
          {book.roomTypes.length === 0 ? (
            <p className="text-sm text-slate-600">Add your room types in Settings first.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[480px] text-left text-sm">
                <thead className="text-xs uppercase tracking-wide text-slate-600">
                  <tr>
                    <th scope="col" className="py-2 pr-3 font-medium">Room type</th>
                    {(plans.length > 0 ? plans : [null]).map((p) => (
                      <th key={p?.id ?? "implicit"} scope="col" className="py-2 pr-3 text-right font-medium">{p?.name ?? "Room only"}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {book.roomTypes.map((t) => (
                    <tr key={t.id}>
                      <th scope="row" className="py-2.5 pr-3 font-medium text-slate-900">{t.name}</th>
                      {(plans.length > 0 ? plans : [null]).map((p) => {
                        const r = priceStay(book, { roomTypeCode: t.id, plan: p?.id ?? null, arrivalDay: today, departureDay: addDays(today, 1), adults: 2, bookedOn: today });
                        return (
                          <td key={p?.id ?? "implicit"} className="py-2.5 pr-3 text-right tabular-nums">
                            {r.ok ? formatPricingAmount(r.firstNightRate, book.currency) : "—"}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </HmsCard>

        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <HmsCard id="restrictions-in-force" icon={Ban} meaning="attention" title="Restrictions in the next 30 days" description={inForce.length === 0 ? "None. Any stay can start and end on any day." : `${inForce.length} rule${inForce.length === 1 ? "" : "s"} limit who can book.`}>
            <Link href={`/hms/${slug}/revenue/restrictions`} className={hmsButton.quiet}>
              See restrictions
            </Link>
          </HmsCard>
          <HmsCard id="plans-on-sale" icon={TrendingUp} meaning="money" title="Rate plans on sale" description={plans.length === 0 ? "Your default plan is created when an owner or admin opens Rate plans." : plans.map((p) => p.name).join(", ")}>
            <Link href={`/hms/${slug}/revenue/plans`} className={hmsButton.quiet}>
              Manage rate plans
            </Link>
          </HmsCard>
        </div>
      </>
    );
  };

  return (
    <RevenueShell slug={slug} title="Revenue" description="Set the price of every room on every plan, keep an eye on how nights are selling, and decide on price suggestions.">
      {await body()}
    </RevenueShell>
  );
}

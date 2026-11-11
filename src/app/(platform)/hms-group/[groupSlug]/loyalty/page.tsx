import Link from "next/link";
import { Gift } from "lucide-react";
import { HmsAlert, HmsCard, HmsEmptyState, HmsPage, HmsPageHeader, hmsButton } from "@/components/hms/hms-ui";
import { loadGroupLoyalty, type GroupLoyaltyView } from "@/lib/hms/groups/group-loyalty";
import { requireGroupPage } from "@/lib/hms/groups/group-page";
import { formatMoney } from "@/lib/hms/reports/model";

export const metadata = { title: "Loyalty" };

export default async function GroupLoyaltyPage({ params }: { params: Promise<{ groupSlug: string }> }) {
  const { groupSlug } = await params;
  const ctx = await requireGroupPage(groupSlug, ["group_owner", "group_admin"]);

  if (!ctx.sharing.shareGuests || !ctx.sharing.shareLoyalty) {
    return (
      <HmsPage>
        <HmsPageHeader eyebrow="Hotel group" meaning="guests" title="Loyalty across the group" />
        <HmsEmptyState
          icon={Gift}
          title="Loyalty isn't shared"
          description="With guest profiles and loyalty both shared, a guest has one points balance across your hotels and can spend points anywhere in the group."
          action={
            ctx.isOwner ? (
              <Link href={`/hms-group/${groupSlug}/settings#sharing`} className={hmsButton.primary}>
                Go to sharing
              </Link>
            ) : undefined
          }
        />
      </HmsPage>
    );
  }

  let view: GroupLoyaltyView | null = null;
  let error = "";
  try {
    view = await loadGroupLoyalty(ctx);
  } catch (e) {
    error = e instanceof Error ? e.message : "Couldn't load loyalty.";
  }
  const cur = ctx.group.baseCurrency;

  return (
    <HmsPage wide>
      <HmsPageHeader eyebrow="Hotel group" meaning="guests" title="Loyalty across the group" description="Points earned and spent by guests known at more than one hotel, and what hotels owe each other for points spent away from where they were earned." />
      <HmsAlert message={error} />
      {view ? (
        <>
          <HmsCard id="loyalty-hotels" title="By hotel" description={view.linkedGuests === 1 ? "1 guest is linked across the group." : `${view.linkedGuests} guests are linked across the group.`} flush>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-600">
                  <tr>
                    <th scope="col" className="px-4 py-3">Hotel</th>
                    <th scope="col" className="px-4 py-3 text-right">Earned</th>
                    <th scope="col" className="px-4 py-3 text-right">Spent</th>
                    <th scope="col" className="px-4 py-3 text-right">Adjusted</th>
                    <th scope="col" className="px-4 py-3 text-right">Balance held</th>
                    <th scope="col" className="px-4 py-3 text-right">Value of balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {view.totals.map((t) => (
                    <tr key={t.tenantId}>
                      <th scope="row" className="px-4 py-3 text-left font-medium">{t.hotelName}</th>
                      <td className="px-4 py-3 text-right tabular-nums">{t.earned.toLocaleString("en-NG")}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{t.redeemed.toLocaleString("en-NG")}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{t.adjusted.toLocaleString("en-NG")}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{t.balance.toLocaleString("en-NG")}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{formatMoney(t.balance * t.pointValue, cur)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </HmsCard>
          <HmsCard id="loyalty-settle" title="Settling between hotels" description="When a guest spends more points at a hotel than they earned there, the extra came from the hotels where they earned it. Valued at the earning hotel's point value." flush>
            {view.owes.length ? (
              <ul className="divide-y divide-slate-100">
                {view.owes.map((o) => (
                  <li key={`${o.fromTenantId}-${o.toTenantId}`} className="px-4 py-3 text-sm sm:px-6">
                    <span className="font-medium">{o.fromName}</span> owes <span className="font-medium">{o.toName}</span> {formatMoney(o.value, cur)}{" "}
                    <span className="text-slate-500">({o.points.toLocaleString("en-NG")} points)</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-6 py-4 text-sm text-slate-600">Nothing to settle: no guest has spent points away from where they earned them.</p>
            )}
          </HmsCard>
        </>
      ) : null}
    </HmsPage>
  );
}

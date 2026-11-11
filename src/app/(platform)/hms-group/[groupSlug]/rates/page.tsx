import { HmsCard, HmsPage, HmsPageHeader, HmsPill, HmsWarning } from "@/components/hms/hms-ui";
import { GroupRatesClient } from "@/components/hms/groups/GroupRatesClient";
import { requireGroupPage } from "@/lib/hms/groups/group-page";
import { loadGroupRates } from "@/lib/hms/groups/group-rates";

export const metadata = { title: "Rates" };

export default async function GroupRatesPage({ params }: { params: Promise<{ groupSlug: string }> }) {
  const { groupSlug } = await params;
  const ctx = await requireGroupPage(groupSlug);
  const view = await loadGroupRates(ctx);

  return (
    <HmsPage wide>
      <HmsPageHeader eyebrow="Hotel group" meaning="money" title="Group rates" description="Set a plan once and send it to your hotels. Each hotel prices it from its own standard rate; hotels can switch a group plan off but not change it." />
      {view.unreadable.length ? <HmsWarning title="Some hotels' plans couldn't be read">{view.unreadable.join(", ")}. The rates feature may not be set up there yet.</HmsWarning> : null}
      <GroupRatesClient groupSlug={groupSlug} canEdit={ctx.canEdit} hotels={ctx.hotels} templates={view.templates} plansByHotel={view.plansByHotel} />
      <HmsCard id="all-plans" title="Every hotel's plans" description="Side by side, read only. Change a hotel's own plans in that hotel's Revenue screens." flush>
        <div className="grid gap-px bg-slate-100 sm:grid-cols-2 lg:grid-cols-3">
          {ctx.hotels.map((h) => (
            <div key={h.tenantId} className="bg-white p-4">
              <p className="font-semibold text-slate-900">{h.name}</p>
              <ul className="mt-2 space-y-1 text-sm">
                {(view.plansByHotel[h.tenantId] ?? []).map((p) => (
                  <li key={p.planId} className="flex flex-wrap items-center gap-2">
                    <span className={p.active ? "text-slate-800" : "text-slate-400 line-through"}>
                      {p.name} ({p.code})
                    </span>
                    {p.isDefault ? <HmsPill tone="blue">Standard</HmsPill> : null}
                    {p.groupTemplateId ? <HmsPill tone="green">Group</HmsPill> : null}
                  </li>
                ))}
                {!(view.plansByHotel[h.tenantId] ?? []).length ? <li className="text-slate-500">No plans yet.</li> : null}
              </ul>
            </div>
          ))}
        </div>
      </HmsCard>
    </HmsPage>
  );
}

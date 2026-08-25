import Link from "next/link";
import { ArrowRight } from "lucide-react";
import HMSLayout from "@/components/hms/HMSLayout";
import { InventoryItemsClient } from "@/components/hms/inventory/InventoryItemsClient";
import { SettingsSectionInfo } from "@/components/hms/settings/SettingsSectionInfo";
import { getHmsAccessContext } from "@/lib/hms/access";
import { getHotelTenantBySlug } from "@/lib/hms/data";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { listCategories, listItems, listItemTypes, listUnits } from "@/lib/hms/inventory-items";

export default async function InventorySettingsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [tenant, access] = await Promise.all([getHotelTenantBySlug(slug), getHmsAccessContext(slug)]);

  const [categories, items, units, itemTypes] = tenant
    ? await (async () => {
        const supabase = createServerSupabaseClient();
        return Promise.all([
          listCategories(supabase, tenant.id),
          listItems(supabase, tenant.id),
          listUnits(supabase, tenant.id),
          listItemTypes(supabase, tenant.id),
        ]);
      })()
    : [[], [], [], []];

  return (
    <HMSLayout slug={slug} requiredSection="inventory-settings">
      <div className="w-full space-y-6 px-6 py-6">
        <div>
          <div className="flex flex-wrap items-center gap-1.5">
            <h1 className="text-xl font-semibold text-slate-900">Inventory settings</h1>
            <SettingsSectionInfo
              title="Inventory settings"
              text="Manage stock categories and the item catalog here. Store locations and lookup lists (units, item types, location types) are structural setup and live on the central Admin Settings page instead — see the link below."
            />
          </div>
          <p className="text-sm text-slate-500">
            Manage stock categories and the item catalog — add a new item, retire one, or reorganize
            categories whenever your stock lineup changes.
          </p>
        </div>

        {access.canAccessAllDepartments ? (
          <Link
            href={`/hms/${slug}/settings#inventory-setup`}
            className="flex items-center justify-between gap-3 rounded-2xl border border-dashed border-slate-300 bg-slate-50/60 px-5 py-3 text-sm text-slate-600 transition-colors hover:border-blue-300 hover:bg-blue-50/40 hover:text-blue-700"
          >
            <span>Store locations, units of measure, item types, and store types are structural setup — manage those on the Admin hub.</span>
            <ArrowRight className="size-4 shrink-0" aria-hidden />
          </Link>
        ) : null}

        <InventoryItemsClient
          slug={slug}
          initialCategories={categories}
          initialItems={items}
          initialUnits={units}
          initialItemTypes={itemTypes}
        />
      </div>
    </HMSLayout>
  );
}

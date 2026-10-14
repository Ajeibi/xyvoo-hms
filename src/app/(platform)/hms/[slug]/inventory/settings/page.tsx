import Link from "next/link";
import { ArrowRight } from "lucide-react";
import HMSLayout from "@/components/hms/HMSLayout";
import { HmsPage, HmsPageHeader } from "@/components/hms/hms-ui";
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
      <HmsPage wide>
        <HmsPageHeader
          eyebrow="Inventory"
          meaning="stock"
          title="Inventory settings"
          description="Manage stock categories and the item catalogue: add a new item, retire one, or reorganise categories whenever your stock changes."
          actions={
            <SettingsSectionInfo
              title="Inventory settings"
              text="Manage stock categories and the item catalog here. Store locations and lookup lists (units, item types, location types) are structural setup and live on the central Admin Settings page instead — see the link below."
            />
          }
        />

        {access.canAccessAllDepartments ? (
          <Link
            href={`/hms/${slug}/settings#inventory-procurement-setup`}
            className="flex items-center justify-between gap-3 rounded-2xl border border-teal-200 bg-teal-50 px-5 py-3.5 text-sm font-medium text-teal-900 transition-colors hover:bg-teal-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            <span>Store locations, units of measure, item types and store types are structural setup. Manage those in the Admin settings hub.</span>
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
      </HmsPage>
    </HMSLayout>
  );
}

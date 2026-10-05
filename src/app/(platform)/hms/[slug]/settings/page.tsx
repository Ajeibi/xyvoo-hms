import HMSLayout from "@/components/hms/HMSLayout";
import DepartmentAccessSetup from "@/components/hms/DepartmentAccessSetup";
import { SmartLockSettingsCard } from "@/components/hms/settings/SmartLockSettingsCard";
import HotelBrandingSetup from "@/components/hms/HotelBrandingSetup";
import HotelRoomPricingSetup from "@/components/hms/HotelRoomPricingSetup";
import { InventoryLocationsClient } from "@/components/hms/inventory/InventoryLocationsClient";
import { InventoryLookupManager } from "@/components/hms/inventory/InventoryLookupManager";
import { InventoryItemTypeManager } from "@/components/hms/inventory/InventoryItemTypeManager";
import { InventorySupplierManager } from "@/components/hms/inventory/InventorySupplierManager";
import { GuestServiceCategoriesManager } from "@/components/hms/settings/GuestServiceCategoriesManager";
import { SettingsGroupHeader } from "@/components/hms/settings/SettingsSectionInfo";
import { SettingsDepartmentPointer } from "@/components/hms/settings/SettingsDepartmentPointer";
import { getHotelRoleAccess } from "@/lib/hms/access";
import { listGuestServiceCategories } from "@/lib/hms/guest-service-categories";
import { getDepartmentLoginsBySlug } from "@/lib/hms/department-logins";
import { getHotelTenantBySlug, getRoomUnitCountForTenant, getTenantRoomCount } from "@/lib/hms/data";
import { normalizeFloorPlan } from "@/lib/hms/floor-plan";
import {
  normalizePricingSetup,
  normalizeRoomTypes,
} from "@/lib/hms/room-pricing";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  listItemTypes,
  listLocations,
  listLocationTypes,
  listSuppliers,
  listUnits,
} from "@/lib/hms/inventory-items";

export default async function SettingsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [tenant, departmentLogins, access] = await Promise.all([
    getHotelTenantBySlug(slug),
    getDepartmentLoginsBySlug(slug),
    getHotelRoleAccess(slug),
  ]);
  const displayName = tenant?.display_name || tenant?.name || slug;
  const logoUrl = tenant?.logo_url || null;
  const [signupRoomCount, inventoryRoomCount] = tenant
    ? await Promise.all([
        getTenantRoomCount(tenant.id),
        getRoomUnitCountForTenant(tenant.id),
      ])
    : [0, 0];
  const roomTypes = normalizeRoomTypes(tenant?.room_types);
  const pricingSetup = normalizePricingSetup(tenant?.pricing_setup);
  const floorPlan = normalizeFloorPlan(tenant?.floor_plan);

  const [invLocations, invLocationTypes, invUnits, invItemTypes, invSuppliers, guestServiceCategories] = tenant
    ? await (async () => {
        const supabase = createServerSupabaseClient();
        return Promise.all([
          listLocations(supabase, tenant.id),
          listLocationTypes(supabase, tenant.id),
          listUnits(supabase, tenant.id),
          listItemTypes(supabase, tenant.id),
          listSuppliers(supabase, tenant.id),
          listGuestServiceCategories(supabase, tenant.id),
        ]);
      })()
    : [[], [], [], [], [], []];

  return (
    <HMSLayout slug={slug} requiredSection="settings">
      {access.isOwnerOrAdmin ? (
        <div className="mx-auto w-full max-w-[1500px] space-y-10 px-6 py-8 sm:px-8">
          <section id="general-setup" className="scroll-mt-24 space-y-4">
            <SettingsGroupHeader
              title="General"
              subtitle="Property-wide identity. Set this up once — it rarely needs to change."
              info="Branding shown across every HMS page, printed registration cards, and the public guest menu. Configure once at onboarding."
            />
            <HotelBrandingSetup
              slug={slug}
              initialName={displayName}
              initialLogoUrl={logoUrl}
            />
          </section>

          <section id="front-desk-setup" className="scroll-mt-24 space-y-4">
            <SettingsGroupHeader
              title="Front Desk & Reservations"
              subtitle="Room structure, rates, service routing, and door locks — the structural setup front desk relies on day to day."
              info="Rooms, floor plan, and rates; which department each guest-service category routes to; and the smart-lock connection. These are structural — set them up once and revisit only occasionally."
            />
            <HotelRoomPricingSetup
              slug={slug}
              initialRoomTypes={roomTypes}
              initialPricingSetup={pricingSetup}
              initialFloorPlan={floorPlan}
              signupRoomCount={signupRoomCount}
              inventoryRoomCount={inventoryRoomCount}
            />
            <GuestServiceCategoriesManager slug={slug} rows={guestServiceCategories} />
            <SmartLockSettingsCard slug={slug} />
          </section>

          <section id="kitchen-restaurant-setup" className="scroll-mt-24 space-y-4">
            <SettingsGroupHeader
              title="Kitchen & Restaurant"
              subtitle="Menu, tables, and kitchen timing are managed daily by that team on their own settings pages."
              info="Menu items and 86'ing dishes change constantly, so this team manages its own settings rather than routing through Admin. Use the links below to jump there."
            />
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <SettingsDepartmentPointer
                title="Restaurant & Bar Settings"
                description="Menu sections, kitchen stations, tables, categories, and items — add a dish, mark one sold out, or open a new table."
                href={`/hms/${slug}/restaurant-bar/settings`}
                linkLabel="Open Restaurant & Bar Settings"
              />
              <SettingsDepartmentPointer
                title="Kitchen Settings"
                description="Order wait thresholds and per-category cook-time targets that drive the kitchen display's overdue alerts."
                href={`/hms/${slug}/kitchen/settings`}
                linkLabel="Open Kitchen Settings"
              />
            </div>
          </section>

          <section id="inventory-procurement-setup" className="scroll-mt-24 space-y-4">
            <SettingsGroupHeader
              title="Inventory & Procurement"
              subtitle="Store locations and lookup lists are structural, set up once here. The item catalog and procurement rules are managed daily on their own team pages."
              info="Stores and lookup lists (units, item types, location types) rarely change, so they stay here. The item catalog and procurement rules change often, so those teams manage them on their own pages — use the links below."
            />

            <InventoryLocationsClient slug={slug} locations={invLocations} locationTypes={invLocationTypes} />

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              <InventoryLookupManager
                slug={slug}
                title="Units of measure"
                description="Available when creating or editing an item."
                apiPath="units"
                singularLabel="Unit"
                rows={invUnits}
                helpText="The measurement units offered when adding or editing a stock item (kg, litre, carton, etc.). Structural setup — add one occasionally, when a new kind of measurement is needed."
              />
              <InventoryItemTypeManager slug={slug} rows={invItemTypes} />
              <InventoryLookupManager
                slug={slug}
                title="Store location types"
                description="Available when creating a store location."
                apiPath="location-types"
                singularLabel="Location type"
                rows={invLocationTypes}
                helpText="The types offered when creating a new store location (e.g. Main Store, Bar Store, Kitchen Store). Structural setup — occasional, not daily."
              />
            </div>

            <InventorySupplierManager slug={slug} suppliers={invSuppliers} />

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <SettingsDepartmentPointer
                title="Inventory Settings"
                description="The item catalog and categories — add a new stock item, retire one, or reorganize categories."
                href={`/hms/${slug}/inventory/settings`}
                linkLabel="Open Inventory Settings"
              />
              <SettingsDepartmentPointer
                title="Procurement Settings"
                description="Vendor categories, approval thresholds, and quality checklists for purchasing."
                href={`/hms/${slug}/procurement/settings`}
                linkLabel="Open Procurement Settings"
              />
            </div>
          </section>

          <section id="staff-access-setup" className="scroll-mt-24 space-y-4">
            <SettingsGroupHeader
              title="Staff & Access"
              subtitle="Security-sensitive setup — only Owner/Admin can create logins or reset passwords. An occasional task, not a daily one."
              info="Department logins and password resets. Kept here rather than in any department's own settings because it's security-sensitive and Owner/Admin-only."
            />
            <DepartmentAccessSetup
              slug={slug}
              initialDepartmentLogins={departmentLogins}
            />
          </section>
        </div>
      ) : (
        <div className="mx-auto w-full max-w-[1100px] px-6 py-8 sm:px-8">
          <div className="rounded-2xl border border-slate-200 bg-white p-6">
            <h1 className="text-xl font-semibold text-slate-900">Settings</h1>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              Hotel setup is managed centrally by the Super Admin. Department users can
              continue daily work from their assigned modules without changing the core
              property configuration.
            </p>
          </div>
        </div>
      )}
    </HMSLayout>
  );
}

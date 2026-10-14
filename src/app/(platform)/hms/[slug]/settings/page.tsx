import type { Metadata } from "next";
import Link from "next/link";
import { BedDouble, Boxes, Building2, ChefHat, Package, ShieldCheck, Soup, Truck, Users, Wine } from "lucide-react";
import HMSLayout from "@/components/hms/HMSLayout";
import { HmsEmptyState, HmsPage, HmsPageHeader, hmsButton } from "@/components/hms/hms-ui";
import { HMS_MEANING, type HmsMeaning } from "@/components/hms/meaning";
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

export const metadata: Metadata = {
  title: "Hotel Settings",
};

const SETTINGS_GROUPS: { id: string; label: string; meaning: HmsMeaning }[] = [
  { id: "general-setup", label: "General", meaning: "neutral" },
  { id: "front-desk-setup", label: "Front desk & reservations", meaning: "rooms" },
  { id: "kitchen-restaurant-setup", label: "Kitchen & restaurant", meaning: "food" },
  { id: "inventory-procurement-setup", label: "Inventory & procurement", meaning: "stock" },
  { id: "staff-access-setup", label: "Staff & access", meaning: "team" },
];

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
        <HmsPage wide>
          <HmsPageHeader
            eyebrow="Settings"
            title="Hotel settings"
            description="The setup your whole hotel runs on. Most of this is done once and only revisited now and then."
            actions={
              <Link href={`/hms/${slug}/setup`} className={hmsButton.secondary}>
                Open Setup Wizard
              </Link>
            }
          />

          <nav aria-label="Settings sections" className="flex flex-wrap gap-2">
            {SETTINGS_GROUPS.map((group) => {
              const tone = HMS_MEANING[group.meaning];
              return (
                <a
                  key={group.id}
                  href={`#${group.id}`}
                  className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3.5 py-1.5 text-sm font-medium text-slate-700 transition-colors hover:border-slate-300 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                >
                  <span aria-hidden className={`h-2 w-2 rounded-full ${tone.dot}`} />
                  {group.label}
                </a>
              );
            })}
          </nav>

          <div className="space-y-10">
          <section id="general-setup" aria-labelledby="general-setup-title" className="scroll-mt-24 space-y-4">
            <SettingsGroupHeader
              id="general-setup-title"
              icon={Building2}
              meaning="neutral"
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

          <section id="front-desk-setup" aria-labelledby="front-desk-setup-title" className="scroll-mt-24 space-y-4">
            <SettingsGroupHeader
              id="front-desk-setup-title"
              icon={BedDouble}
              meaning="rooms"
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

          <section id="kitchen-restaurant-setup" aria-labelledby="kitchen-restaurant-setup-title" className="scroll-mt-24 space-y-4">
            <SettingsGroupHeader
              id="kitchen-restaurant-setup-title"
              icon={Soup}
              meaning="food"
              title="Kitchen & Restaurant"
              subtitle="Menu, tables, and kitchen timing are managed daily by that team on their own settings pages."
              info="Menu items and 86'ing dishes change constantly, so this team manages its own settings rather than routing through Admin. Use the links below to jump there."
            />
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <SettingsDepartmentPointer
                icon={Wine}
                meaning="food"
                title="Restaurant & Bar Settings"
                description="Menu sections, kitchen stations, tables, categories, and items — add a dish, mark one sold out, or open a new table."
                href={`/hms/${slug}/restaurant-bar/settings`}
                linkLabel="Open Restaurant & Bar Settings"
              />
              <SettingsDepartmentPointer
                icon={ChefHat}
                meaning="food"
                title="Kitchen Settings"
                description="Order wait thresholds and per-category cook-time targets that drive the kitchen display's overdue alerts."
                href={`/hms/${slug}/kitchen/settings`}
                linkLabel="Open Kitchen Settings"
              />
            </div>
          </section>

          <section id="inventory-procurement-setup" aria-labelledby="inventory-procurement-setup-title" className="scroll-mt-24 space-y-4">
            <SettingsGroupHeader
              id="inventory-procurement-setup-title"
              icon={Package}
              meaning="stock"
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
                icon={Boxes}
                meaning="stock"
                title="Inventory Settings"
                description="The item catalogue and categories — add a new stock item, retire one, or reorganise categories."
                href={`/hms/${slug}/inventory/settings`}
                linkLabel="Open Inventory Settings"
              />
              <SettingsDepartmentPointer
                icon={Truck}
                meaning="stock"
                title="Procurement Settings"
                description="Vendor categories, approval thresholds, and quality checklists for purchasing."
                href={`/hms/${slug}/procurement/settings`}
                linkLabel="Open Procurement Settings"
              />
            </div>
          </section>

          <section id="staff-access-setup" aria-labelledby="staff-access-setup-title" className="scroll-mt-24 space-y-4">
            <SettingsGroupHeader
              id="staff-access-setup-title"
              icon={Users}
              meaning="team"
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
        </HmsPage>
      ) : (
        <HmsPage>
          <HmsPageHeader eyebrow="Settings" title="Settings" />
          <HmsEmptyState
            icon={ShieldCheck}
            meaning="team"
            title="Hotel setup is looked after by your owner or admin"
            description="You can carry on with your daily work from your own department's pages. If something in the hotel's setup needs changing, ask your owner or admin."
          />
        </HmsPage>
      )}
    </HMSLayout>
  );
}

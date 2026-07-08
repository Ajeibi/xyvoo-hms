import HMSLayout from "@/components/hms/HMSLayout";
import DepartmentAccessSetup from "@/components/hms/DepartmentAccessSetup";
import { SmartLockSettingsCard } from "@/components/hms/settings/SmartLockSettingsCard";
import HotelBrandingSetup from "@/components/hms/HotelBrandingSetup";
import HotelMenuSetup from "@/components/hms/HotelMenuSetup";
import HotelRoomPricingSetup from "@/components/hms/HotelRoomPricingSetup";
import { getHotelRoleAccess } from "@/lib/hms/access";
import { getDepartmentLoginsBySlug } from "@/lib/hms/department-logins";
import { getHotelTenantBySlug, getRoomUnitCountForTenant, getTenantRoomCount } from "@/lib/hms/data";
import { normalizeFloorPlan } from "@/lib/hms/floor-plan";
import { loadHotelMenuSetupModel } from "@/lib/hms/load-fb-pages";
import {
  normalizePricingSetup,
  normalizeRoomTypes,
} from "@/lib/hms/room-pricing";

export default async function SettingsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const tenant = await getHotelTenantBySlug(slug);
  const departmentLogins = await getDepartmentLoginsBySlug(slug);
  const access = await getHotelRoleAccess(slug);
  const displayName = tenant?.display_name || tenant?.name || slug;
  const logoUrl = tenant?.logo_url || null;
  const signupRoomCount = tenant ? await getTenantRoomCount(tenant.id) : 0;
  const inventoryRoomCount = tenant ? await getRoomUnitCountForTenant(tenant.id) : 0;
  const roomTypes = normalizeRoomTypes(tenant?.room_types);
  const pricingSetup = normalizePricingSetup(tenant?.pricing_setup);
  const floorPlan = normalizeFloorPlan(tenant?.floor_plan);
  const menuModel = tenant ? await loadHotelMenuSetupModel(slug) : null;
  const emptyMenu = {
    outlets: [],
    stations: [],
    categories: [],
    items: [],
    tables: [],
  };

  return (
    <HMSLayout slug={slug} requiredSection="settings">
      {access.isOwnerOrAdmin ? (
        <div className="mx-auto w-full max-w-[1500px] space-y-6 px-6 py-8 sm:px-8">
          <section id="hotel-branding-setup" className="scroll-mt-24">
            <HotelBrandingSetup
              slug={slug}
              initialName={displayName}
              initialLogoUrl={logoUrl}
            />
          </section>

          <section id="rooms-pricing-setup" className="scroll-mt-24">
            <HotelRoomPricingSetup
              slug={slug}
              initialRoomTypes={roomTypes}
              initialPricingSetup={pricingSetup}
              initialFloorPlan={floorPlan}
              signupRoomCount={signupRoomCount}
              inventoryRoomCount={inventoryRoomCount}
            />
          </section>

          <section id="menu-setup" className="scroll-mt-24">
            <HotelMenuSetup
              slug={slug}
              currency={pricingSetup.currency}
              initial={menuModel?.initial ?? emptyMenu}
            />
          </section>

          <section id="department-access-setup" className="scroll-mt-24">
            <DepartmentAccessSetup
              slug={slug}
              initialDepartmentLogins={departmentLogins}
            />
          </section>

          <section id="smart-lock-setup" className="scroll-mt-24">
            <SmartLockSettingsCard slug={slug} />
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

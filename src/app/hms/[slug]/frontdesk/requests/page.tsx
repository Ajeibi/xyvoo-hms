import HMSLayout from "@/components/hms/HMSLayout";
import { FrontDeskRequestsClient } from "@/components/hms/frontdesk/requests/FrontDeskRequestsClient";
import { getHotelTenantBySlug } from "@/lib/hms/data";
import { getHmsAccessContext } from "@/lib/hms/access";
import { getRequestsIncidentsCapabilities } from "@/lib/hms/requests-incidents-rbac";
import { normalizeRoomTypes } from "@/lib/hms/room-pricing";

export default async function FrontDeskRequestsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [tenant, access] = await Promise.all([getHotelTenantBySlug(slug), getHmsAccessContext(slug)]);
  const roomTypes = normalizeRoomTypes(tenant?.room_types);

  const capabilities = getRequestsIncidentsCapabilities({
    membershipRole: access.role ?? "staff",
    departmentRole: access.departmentRole,
  });

  return (
    <HMSLayout slug={slug} requiredSection="frontdesk">
      <FrontDeskRequestsClient slug={slug} capabilities={capabilities} roomTypes={roomTypes} />
    </HMSLayout>
  );
}

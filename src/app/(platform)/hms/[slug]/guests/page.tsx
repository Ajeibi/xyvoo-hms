import HMSLayout from "@/components/hms/HMSLayout";
import { getHotelTenantBySlug } from "@/lib/hms/data";
import { getGuestsDirectory } from "@/lib/hms/guests-directory";
import { GuestsDirectoryClient } from "@/components/hms/guests/GuestsDirectoryClient";

export default async function GuestsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const tenant = await getHotelTenantBySlug(slug);
  const payload = tenant
    ? await getGuestsDirectory(tenant.id, { page: 1, pageSize: 5 })
    : { rows: [], summary: { totalGuests: 0, vipGuests: 0, withOpenRequests: 0, repeatGuests: 0 }, total: 0 };

  return (
    <HMSLayout slug={slug} requiredSection="guests">
      <GuestsDirectoryClient slug={slug} initial={payload} />
    </HMSLayout>
  );
}

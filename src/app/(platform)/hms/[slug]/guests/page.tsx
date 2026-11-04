import type { Metadata } from "next";
import HMSLayout from "@/components/hms/HMSLayout";
import { getHotelTenantBySlug } from "@/lib/hms/data";
import { getGuestsDirectory } from "@/lib/hms/guests-directory";
import { GuestsDirectoryClient } from "@/components/hms/guests/GuestsDirectoryClient";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { listCompanyOptions, loadGuestPageContext } from "@/lib/hms/guest-page";
import { listSavedSegments } from "@/lib/hms/guest-segments";
import { BUILT_IN_SEGMENTS } from "@/lib/hms/guest-segments-shared";

export const metadata: Metadata = {
  title: "Guests",
};

export default async function GuestsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ segment?: string }>;
}) {
  const { slug } = await params;
  const { segment } = await searchParams;
  const tenant = await getHotelTenantBySlug(slug);
  const ctx = tenant ? await loadGuestPageContext(slug) : null;
  const activeSegment = typeof segment === "string" && segment.length <= 80 ? segment : null;

  const payload = tenant
    ? await getGuestsDirectory(tenant.id, { page: 1, pageSize: 10, segment: activeSegment })
    : { rows: [], summary: { totalGuests: 0, vipGuests: 0, withOpenRequests: 0, repeatGuests: 0 }, total: 0 };

  const saved = tenant ? await listSavedSegments(createServerSupabaseClient(), tenant.id) : [];
  const segmentOptions = [
    ...BUILT_IN_SEGMENTS.map((s) => ({ key: s.key, label: s.label })),
    ...saved.map((s) => ({ key: `saved:${s.id}`, label: s.name })),
  ];
  const companies = tenant ? await listCompanyOptions(tenant.id) : [];

  return (
    <HMSLayout slug={slug} requiredSection="guests">
      <GuestsDirectoryClient
        slug={slug}
        initial={payload}
        initialSegment={activeSegment ?? ""}
        segmentOptions={segmentOptions}
        companies={companies}
        canEdit={ctx?.canEdit ?? false}
      />
    </HMSLayout>
  );
}

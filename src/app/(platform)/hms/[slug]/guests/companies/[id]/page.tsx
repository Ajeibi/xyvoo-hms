import { notFound } from "next/navigation";
import HMSLayout from "@/components/hms/HMSLayout";
import { CompanyProfileClient } from "@/components/hms/guests/CompanyProfileClient";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { loadGuestPageContext } from "@/lib/hms/guest-page";
import { getCompanyProfile } from "@/lib/hms/guest-companies";

export default async function CompanyProfilePage({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const ctx = await loadGuestPageContext(slug);
  if (!ctx) notFound();
  const company = await getCompanyProfile(createServerSupabaseClient(), ctx.tenant.id, id);
  if (!company) notFound();

  return (
    <HMSLayout slug={slug} requiredSection="guests">
      <CompanyProfileClient slug={slug} company={company} canEdit={ctx.canEdit} currency={ctx.currency} />
    </HMSLayout>
  );
}

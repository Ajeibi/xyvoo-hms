import type { Metadata } from "next";
import { notFound } from "next/navigation";
import HMSLayout from "@/components/hms/HMSLayout";
import { CompaniesClient } from "@/components/hms/guests/CompaniesClient";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { loadGuestPageContext } from "@/lib/hms/guest-page";
import { listCompanies } from "@/lib/hms/guest-companies";

export const metadata: Metadata = { title: "Companies" };

export default async function CompaniesPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await loadGuestPageContext(slug);
  if (!ctx) notFound();
  const companies = await listCompanies(createServerSupabaseClient(), ctx.tenant.id);

  return (
    <HMSLayout slug={slug} requiredSection="guests">
      <CompaniesClient slug={slug} companies={companies} canEdit={ctx.canEdit} currency={ctx.currency} />
    </HMSLayout>
  );
}

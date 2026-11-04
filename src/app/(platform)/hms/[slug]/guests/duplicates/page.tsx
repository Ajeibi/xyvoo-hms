import type { Metadata } from "next";
import { notFound } from "next/navigation";
import HMSLayout from "@/components/hms/HMSLayout";
import { GuestDuplicatesClient } from "@/components/hms/guests/GuestDuplicatesClient";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { loadGuestPageContext } from "@/lib/hms/guest-page";
import { listDuplicateCandidates, listRecentMerges } from "@/lib/hms/guest-merge";

export const metadata: Metadata = { title: "Duplicate guests" };

export default async function GuestDuplicatesPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await loadGuestPageContext(slug);
  if (!ctx) notFound();
  const service = createServerSupabaseClient();
  const [candidates, recentMerges] = await Promise.all([listDuplicateCandidates(service, ctx.tenant.id), listRecentMerges(service, ctx.tenant.id)]);

  return (
    <HMSLayout slug={slug} requiredSection="guests">
      <GuestDuplicatesClient slug={slug} candidates={candidates} recentMerges={recentMerges} canManage={ctx.canManage} currency={ctx.currency} />
    </HMSLayout>
  );
}

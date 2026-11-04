import { RestrictionsClient } from "@/components/hms/revenue/RestrictionsClient";
import { RevenueShell } from "@/components/hms/revenue/RevenueShell";

export default async function RestrictionsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return (
    <RevenueShell slug={slug} title="Restrictions" description="Minimum stays, closed nights, no arrivals or departures, and how far ahead a plan can be booked.">
      <RestrictionsClient slug={slug} />
    </RevenueShell>
  );
}

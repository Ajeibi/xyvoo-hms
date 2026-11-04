import { RatePlansClient } from "@/components/hms/revenue/RatePlansClient";
import { RevenueShell } from "@/components/hms/revenue/RevenueShell";

export default async function RatePlansPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return (
    <RevenueShell slug={slug} title="Rate plans" description="The ways you sell a room, and how each one is priced from the others.">
      <RatePlansClient slug={slug} />
    </RevenueShell>
  );
}

import { PricesClient } from "@/components/hms/revenue/PricesClient";
import { RevenueShell } from "@/components/hms/revenue/RevenueShell";

export default async function PricesPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return (
    <RevenueShell slug={slug} title="Prices" description="Seasonal, weekend and holiday prices for each rate plan, and a check of what any stay would cost.">
      <PricesClient slug={slug} />
    </RevenueShell>
  );
}

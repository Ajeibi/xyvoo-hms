import { RatesCalendarClient } from "@/components/hms/revenue/RatesCalendarClient";
import { RevenueShell } from "@/components/hms/revenue/RevenueShell";

export default async function RatesCalendarPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return (
    <RevenueShell slug={slug} wide title="Rates calendar" description="Price, restrictions and rooms left for every night, in one grid. Change a night or a run of nights in two taps.">
      <RatesCalendarClient slug={slug} />
    </RevenueShell>
  );
}

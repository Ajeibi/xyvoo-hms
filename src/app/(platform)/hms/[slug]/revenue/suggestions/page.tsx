import { RevenueShell } from "@/components/hms/revenue/RevenueShell";
import { SuggestionsClient } from "@/components/hms/revenue/SuggestionsClient";

export default async function SuggestionsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return (
    <RevenueShell slug={slug} title="Price suggestions" description="Higher or lower prices for the nights that are selling faster or slower than usual. You decide each one.">
      <SuggestionsClient slug={slug} />
    </RevenueShell>
  );
}

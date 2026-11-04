import Link from "next/link";
import { Layers, Sparkles, CalendarRange } from "lucide-react";
import HMSLayout from "@/components/hms/HMSLayout";
import { HmsCard, HmsPage, HmsPageHeader, hmsButton } from "@/components/hms/hms-ui";

export default async function RevenueSettingsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const base = `/hms/${slug}/revenue`;

  return (
    <HMSLayout slug={slug} requiredSection="revenue-settings">
      <HmsPage>
        <HmsPageHeader eyebrow="Revenue" meaning="money" title="Revenue settings" description="Where each part of pricing is set up. Room prices for each room type are still in the hotel's main Settings." />
        <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
          <HmsCard id="settings-plans" icon={Layers} meaning="money" title="Rate plans" description="Room only, bed and breakfast, non-refundable, company rates, and how each follows another.">
            <Link href={`${base}/plans`} className={hmsButton.secondary}>Open rate plans</Link>
          </HmsCard>
          <HmsCard id="settings-prices" icon={CalendarRange} meaning="money" title="Prices and restrictions" description="Seasonal and weekend prices, minimum stays, and closed nights.">
            <div className="flex flex-wrap gap-2">
              <Link href={`${base}/prices`} className={hmsButton.secondary}>Prices</Link>
              <Link href={`${base}/restrictions`} className={hmsButton.secondary}>Restrictions</Link>
            </div>
          </HmsCard>
          <HmsCard id="settings-suggestions" icon={Sparkles} meaning="money" title="Price suggestions" description="Turn suggestions on or off, and set the lowest and highest price and the biggest step.">
            <Link href={`${base}/suggestions#suggestion-limits`} className={hmsButton.secondary}>Open the limits</Link>
          </HmsCard>
        </div>
      </HmsPage>
    </HMSLayout>
  );
}

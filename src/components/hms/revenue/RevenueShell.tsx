import HMSLayout from "@/components/hms/HMSLayout";
import { HmsPage, HmsPageHeader } from "@/components/hms/hms-ui";
import { RevenueTabs } from "@/components/hms/revenue/RevenueTabs";

/** The frame every revenue screen sits in: the page header and the tab strip. */
export function RevenueShell({
  slug,
  title,
  description,
  wide = false,
  children,
}: {
  slug: string;
  title: string;
  description: string;
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <HMSLayout slug={slug} requiredSection="revenue">
      <HmsPage wide={wide}>
        <HmsPageHeader eyebrow="Revenue" meaning="money" title={title} description={description} />
        <RevenueTabs slug={slug} />
        {children}
      </HmsPage>
    </HMSLayout>
  );
}

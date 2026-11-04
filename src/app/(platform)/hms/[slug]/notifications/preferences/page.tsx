import Link from "next/link";
import HMSLayout from "@/components/hms/HMSLayout";
import { HmsPage, HmsPageHeader, hmsButton } from "@/components/hms/hms-ui";
import { MyAlertsClient } from "@/components/hms/notifications/MyAlertsClient";

export default async function MyAlertsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return (
    <HMSLayout slug={slug} requiredSection="notifications">
      <HmsPage>
        <HmsPageHeader
          eyebrow="Notifications"
          meaning="neutral"
          title="My alerts"
          description="Choose which alerts reach you, and how: in the app, by email, on WhatsApp or as a push on your phone."
          actions={
            <Link href={`/hms/${slug}/notifications`} className={hmsButton.secondary}>
              Back to notifications
            </Link>
          }
        />
        <MyAlertsClient slug={slug} />
      </HmsPage>
    </HMSLayout>
  );
}

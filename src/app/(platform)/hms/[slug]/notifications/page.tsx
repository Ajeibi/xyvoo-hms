import HMSLayout from "@/components/hms/HMSLayout";
import { HmsPage, HmsPageHeader } from "@/components/hms/hms-ui";
import { NotificationsPageClient } from "@/components/hms/notifications/NotificationsPageClient";
import { getHmsAccessContext } from "@/lib/hms/access";
import { getHotelTenantBySlug } from "@/lib/hms/data";
import { notificationVisibilityFilter } from "@/lib/hms/front-desk-ops";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export default async function NotificationsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [tenant, access] = await Promise.all([getHotelTenantBySlug(slug), getHmsAccessContext(slug)]);
  const items: {
    id: string;
    title: string;
    body: string;
    severity: string;
    createdAt: string;
    read: boolean;
  }[] = [];

  if (tenant) {
    const supabase = createServerSupabaseClient();
    let query = supabase
      .schema("hotel")
      .from("notifications")
      .select("id,title,body,severity,created_at,read_at")
      .eq("tenant_id", tenant.id);

    const scopeFilter = notificationVisibilityFilter(access.departmentRole);
    if (scopeFilter) query = query.or(scopeFilter);

    const { data } = await query.order("created_at", { ascending: false }).limit(100);

    for (const n of data ?? []) {
      items.push({
        id: n.id,
        title: n.title,
        body: n.body,
        severity: n.severity,
        createdAt: n.created_at,
        read: Boolean(n.read_at),
      });
    }
  }

  return (
    <HMSLayout slug={slug} requiredSection="notifications">
      <HmsPage>
        <HmsPageHeader
          eyebrow="Notifications"
          meaning="neutral"
          title="Notifications"
          description="Alerts, reminders and updates for your hotel, newest first."
        />
        <NotificationsPageClient slug={slug} initialItems={items} />
      </HmsPage>
    </HMSLayout>
  );
}

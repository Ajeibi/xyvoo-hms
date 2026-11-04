import Link from "next/link";
import HMSLayout from "@/components/hms/HMSLayout";
import { HmsPage, HmsPageHeader, hmsButton } from "@/components/hms/hms-ui";
import { NotificationsPageClient } from "@/components/hms/notifications/NotificationsPageClient";
import { getHmsAccessContext } from "@/lib/hms/access";
import { getHotelTenantBySlug } from "@/lib/hms/data";
import { notificationVisibilityFilter } from "@/lib/hms/front-desk-ops";
import { alertPath, groupsForRole, roleGroupFilter } from "@/lib/hms/notification-catalogue";
import { getReadNotificationIds } from "@/lib/hms/notification-reads";
import { hideMutedFilter, mutedInAppGroups } from "@/lib/hms/notification-preferences";
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
    href: string;
  }[] = [];

  if (tenant) {
    const supabase = createServerSupabaseClient();
    let query = supabase
      .schema("hotel")
      .from("notifications")
      .select("id,type,title,body,severity,created_at")
      .eq("tenant_id", tenant.id);

    const scopeFilter = notificationVisibilityFilter(access.departmentRole);
    if (scopeFilter) query = query.or(scopeFilter);
    const roleFilter = roleGroupFilter(groupsForRole(access.role, access.departmentRole));
    if (roleFilter) query = query.or(roleFilter);
    const mutedFilter = access.userId
      ? hideMutedFilter(await mutedInAppGroups(supabase, tenant.id, access.userId))
      : null;
    if (mutedFilter) query = query.or(mutedFilter);

    const { data } = await query.order("created_at", { ascending: false }).limit(100);

    // Read state is per person (notification_reads); notifications.read_at is no longer written.
    const readIds = access.userId
      ? await getReadNotificationIds(supabase, tenant.id, access.userId, (data ?? []).map((n) => n.id as string))
      : new Set<string>();

    for (const n of data ?? []) {
      items.push({
        id: n.id,
        title: n.title,
        body: n.body,
        severity: n.severity,
        createdAt: n.created_at,
        read: readIds.has(n.id),
        href: alertPath(slug, n.type),
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
          actions={
            <Link href={`/hms/${slug}/notifications/preferences`} className={hmsButton.secondary}>
              My alerts
            </Link>
          }
        />
        <NotificationsPageClient slug={slug} initialItems={items} />
      </HmsPage>
    </HMSLayout>
  );
}

import { Bell } from "lucide-react";
import HMSLayout from "@/components/hms/HMSLayout";
import { NotificationsPageClient } from "@/components/hms/notifications/NotificationsPageClient";
import { getHotelTenantBySlug } from "@/lib/hms/data";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export default async function NotificationsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const tenant = await getHotelTenantBySlug(slug);
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
    const { data } = await supabase
      .schema("hotel")
      .from("notifications")
      .select("id,title,body,severity,created_at,read_at")
      .eq("tenant_id", tenant.id)
      .order("created_at", { ascending: false })
      .limit(100);

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
      <div className="mx-auto w-full max-w-4xl px-6 py-8 sm:px-8">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
            <Bell className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-slate-900">Notifications</h1>
            <p className="mt-0.5 text-sm text-slate-500">
              Alerts, reminders, and system updates for this property.
            </p>
          </div>
        </div>
        <NotificationsPageClient slug={slug} initialItems={items} />
      </div>
    </HMSLayout>
  );
}

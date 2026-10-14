import Link from "next/link";
import { ArrowLeft, History } from "lucide-react";
import HMSLayout from "@/components/hms/HMSLayout";
import { HmsCard, HmsEmptyState, HmsPage, HmsPageHeader } from "@/components/hms/hms-ui";
import { getHotelTenantBySlug } from "@/lib/hms/data";
import { formatAuditMessage } from "@/lib/hms/front-desk-ops";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export default async function FrontDeskActivityPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const tenant = await getHotelTenantBySlug(slug);
  if (!tenant) return null;

  const supabase = createServerSupabaseClient();
  const [{ data: logs }, { data: profiles }] = await Promise.all([
    supabase
      .schema("hotel")
      .from("audit_logs")
      .select("id,actor_user_id,action,entity_type,before_state,after_state,created_at")
      .eq("tenant_id", tenant.id)
      .order("created_at", { ascending: false })
      .limit(100),
    supabase.schema("hotel").from("profiles").select("user_id,contact_name").eq("tenant_id", tenant.id),
  ]);

  const names = new Map((profiles ?? []).map((p) => [p.user_id, p.contact_name ?? "Staff"]));
  const entries = logs ?? [];

  return (
    <HMSLayout slug={slug} requiredSection="frontdesk">
      <HmsPage>
        <Link
          href={`/hms/${slug}/frontdesk`}
          className="inline-flex items-center gap-2 rounded-lg text-sm font-medium text-blue-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Back to the front desk
        </Link>
        <HmsPageHeader
          eyebrow="Front desk"
          meaning="neutral"
          title="Activity log"
          description="The latest things staff have done around the hotel, newest first."
        />
        {entries.length === 0 ? (
          <HmsEmptyState
            art="chart"
            meaning="neutral"
            title="Nothing logged yet"
            description="When staff check guests in, move rooms or change bookings, each action will be listed here."
          />
        ) : (
          <HmsCard
            id="activity-log"
            icon={History}
            meaning="neutral"
            title="Recent activity"
            description={`The last ${entries.length} ${entries.length === 1 ? "action" : "actions"}.`}
            flush
          >
            <ul className="divide-y divide-slate-100">
              {entries.map((log) => (
                <li key={log.id} className="px-5 py-3 text-sm text-slate-700 sm:px-6">
                  {formatAuditMessage({
                    actorName: log.actor_user_id ? (names.get(log.actor_user_id) ?? "Staff") : "System",
                    action: log.action,
                    entityType: log.entity_type,
                    before: log.before_state as Record<string, unknown> | null,
                    after: log.after_state as Record<string, unknown> | null,
                    createdAt: log.created_at,
                  })}
                </li>
              ))}
            </ul>
          </HmsCard>
        )}
      </HmsPage>
    </HMSLayout>
  );
}

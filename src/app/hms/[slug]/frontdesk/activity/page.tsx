import Link from "next/link";
import HMSLayout from "@/components/hms/HMSLayout";
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

  return (
    <HMSLayout slug={slug} requiredSection="frontdesk">
      <div className="mx-auto max-w-3xl px-6 py-8 sm:px-8">
        <Link href={`/hms/${slug}/frontdesk`} className="text-sm text-blue-600 hover:underline">
          ← Front desk
        </Link>
        <h1 className="mt-4 text-2xl font-semibold text-slate-900">Activity log</h1>
        <p className="mt-1 text-sm text-slate-500">Recent staff actions on property operations.</p>
        <ul className="mt-6 space-y-2">
          {(logs ?? []).map((log) => (
            <li
              key={log.id}
              className="rounded-xl border border-slate-100 bg-white px-4 py-3 text-sm text-slate-700"
            >
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
      </div>
    </HMSLayout>
  );
}

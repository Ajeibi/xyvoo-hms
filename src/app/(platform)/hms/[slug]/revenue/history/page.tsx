import { History } from "lucide-react";
import { HmsCard, HmsEmptyState } from "@/components/hms/hms-ui";
import { RevenueShell } from "@/components/hms/revenue/RevenueShell";
import { getHotelTenantBySlug } from "@/lib/hms/data";
import { normalizePricingSetup } from "@/lib/hms/room-pricing";
import { RATE_ACTIONS, describeRateChange } from "@/lib/hms/rates/history";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export default async function RateHistoryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const tenant = await getHotelTenantBySlug(slug);
  const body = async () => {
    if (!tenant) return <HmsEmptyState art="page" meaning="money" title="We couldn't find this hotel" description="Check the web address, or go back to your dashboard and try again." />;
    const currency = normalizePricingSetup(tenant.pricing_setup).currency;
    const db = createServerSupabaseClient();
    const [{ data: logs }, { data: profiles }] = await Promise.all([
      db
        .schema("hotel")
        .from("audit_logs")
        .select("id,actor_user_id,action,before_state,after_state,created_at")
        .eq("tenant_id", tenant.id)
        .in("action", [...RATE_ACTIONS])
        .order("created_at", { ascending: false })
        .limit(150),
      db.schema("hotel").from("profiles").select("user_id,contact_name").eq("tenant_id", tenant.id),
    ]);
    const names = new Map((profiles ?? []).map((p) => [p.user_id as string, (p.contact_name as string) ?? "Staff"]));
    const rows = logs ?? [];
    if (rows.length === 0) {
      return <HmsEmptyState art="chart" meaning="money" title="No rate changes yet" description="Every change to a plan, price, restriction or suggestion is listed here with who made it and when." />;
    }
    return (
      <HmsCard id="rate-history" icon={History} meaning="money" title="Changes to rates" description={`The last ${rows.length} change${rows.length === 1 ? "" : "s"}, newest first.`} flush>
        <ul className="divide-y divide-slate-100">
          {rows.map((r) => (
            <li key={r.id as string} className="px-5 py-3 text-sm sm:px-6">
              <p className="text-slate-900">{describeRateChange(r.action as string, r.before_state as Record<string, unknown> | null, r.after_state as Record<string, unknown> | null, currency)}</p>
              <p className="text-xs text-slate-600">
                {r.actor_user_id ? names.get(r.actor_user_id as string) ?? "Staff" : "System"} ·{" "}
                {new Date(r.created_at as string).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
              </p>
            </li>
          ))}
        </ul>
      </HmsCard>
    );
  };
  return (
    <RevenueShell slug={slug} title="History" description="Who changed which plan, price or restriction, and when.">
      {await body()}
    </RevenueShell>
  );
}

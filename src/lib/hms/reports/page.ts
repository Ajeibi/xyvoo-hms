import { getHmsAccessContext } from "@/lib/hms/access";
import { getHotelTenantBySlug } from "@/lib/hms/data";
import { getReportsCapabilities } from "@/lib/hms/reports-rbac";
import { normalizePricingSetup } from "@/lib/hms/room-pricing";
import { isIsoDate } from "@/lib/hms/reports/dates";
import { clampParams, defaultParams, makeReportContext, type ReportContext, type ReportParams } from "@/lib/hms/reports/library";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type SearchParams = Record<string, string | string[] | undefined>;

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** Everything a reports page needs: the hotel, what this person may run, and a context to run reports in. */
export async function getReportsPageContext(slug: string) {
  const [access, tenant] = await Promise.all([getHmsAccessContext(slug), getHotelTenantBySlug(slug)]);
  if (!tenant) return null;
  const caps = getReportsCapabilities({ membershipRole: access.role ?? "staff", departmentRole: access.departmentRole });
  const currency = normalizePricingSetup(tenant.pricing_setup).currency;
  const hotelName = tenant.display_name?.trim() || tenant.name?.trim() || slug;
  const ctx: ReportContext = await makeReportContext(createServerSupabaseClient(), tenant.id, currency, hotelName);
  return { access, tenant, caps, currency, hotelName, ctx };
}

/** Dates from the address bar; anything that isn't a real date falls back to today or this month. */
export function paramsFromSearch(search: SearchParams, businessDate: string): ReportParams {
  const d = defaultParams(businessDate);
  const pick = (key: string, fallback: string) => {
    const v = first(search[key]);
    return isIsoDate(v) ? v : fallback;
  };
  return clampParams({ date: pick("date", d.date), from: pick("from", d.from), to: pick("to", d.to) });
}

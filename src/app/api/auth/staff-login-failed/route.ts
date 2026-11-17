import { NextResponse } from "next/server";
import { z } from "zod";
import { clientIp, rateLimitShared } from "@/lib/rate-limit";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getHotelTenantBySlug } from "@/lib/hms/data";
import { recordAudit } from "@/lib/hms/audit";
import { normalizeHotelKey, normalizeUsername } from "@/lib/hms/staff-identity";

const Schema = z.object({ identifier: z.string().min(3).max(120) });

/**
 * The sign-in page tells us a staff sign-in (username@hotel) failed, so the hotel's activity log shows
 * repeated guessing. It reveals nothing (always the same answer) and logs only for a real staff username.
 */
export async function POST(req: Request) {
  const ok = NextResponse.json({ ok: true });
  try {
    const { identifier } = Schema.parse(await req.json());
    const limited = await rateLimitShared(`staff-login-failed:${clientIp(req)}`, 20, 10 * 60_000);
    if (!limited.ok) return ok;

    const at = identifier.lastIndexOf("@");
    if (at <= 0 || identifier.slice(at + 1).includes(".")) return ok;
    const username = normalizeUsername(identifier.slice(0, at));
    const hotel = normalizeHotelKey(identifier.slice(at + 1));
    if (!username || !hotel) return ok;

    const tenant = await getHotelTenantBySlug(hotel);
    if (!tenant) return ok;
    const service = createServerSupabaseClient();
    const { data: membership } = await service
      .schema("hotel")
      .from("memberships")
      .select("user_id, department_role")
      .eq("tenant_id", tenant.id)
      .ilike("username", username)
      .maybeSingle();
    if (!membership) return ok;

    await recordAudit(service, {
      tenantId: tenant.id,
      action: "login_failed",
      entityType: "staff_login",
      entityId: membership.user_id as string,
      actor: { userId: membership.user_id as string, department: (membership.department_role as string | null) ?? null },
      device: (req.headers.get("user-agent") ?? "").slice(0, 120) || null,
    });
  } catch {
    /* never tells the caller anything */
  }
  return ok;
}

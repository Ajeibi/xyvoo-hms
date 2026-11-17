import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/supabase/auth-server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getHotelTenantBySlug } from "@/lib/hms/data";
import { setActiveState } from "@/lib/hms/active-person";
import { recordAudit } from "@/lib/hms/audit";
import { verifyPin } from "@/lib/hms/pin";
import { rateLimitShared } from "@/lib/rate-limit";
import { listSwitchablePeople, MAX_PIN_ATTEMPTS } from "@/lib/hms/session-switch";

const Schema = z.object({ slug: z.string().min(1), userId: z.string().uuid(), pin: z.string().regex(/^\d{4,6}$/, "Enter your 4 to 6 digit PIN.") });

/** Take the keys on a shared screen, or unlock it: pick yourself and enter your PIN. Every action is then stamped with you. */
export async function POST(req: Request) {
  try {
    const body = Schema.parse(await req.json());
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const tenant = await getHotelTenantBySlug(body.slug);
    if (!tenant) return NextResponse.json({ error: "Tenant not found." }, { status: 404 });

    const limited = await rateLimitShared(`pin-switch:${tenant.id}:${user.id}`, 30, 10 * 60_000);
    if (!limited.ok) return NextResponse.json({ error: "Too many tries. Wait a few minutes." }, { status: 429 });

    const service = createServerSupabaseClient();
    const people = await listSwitchablePeople(service, tenant.id, user.id);
    const target = people.find((p) => p.userId === body.userId);
    if (!target) return NextResponse.json({ error: "You can't switch to that person on this screen." }, { status: 403 });
    if (!target.hasPin) return NextResponse.json({ error: `${target.name} hasn't set a PIN yet.` }, { status: 400 });
    if (target.pinLocked) {
      return NextResponse.json({ error: `${target.name}'s PIN is locked. Ask the head of department to clear it.` }, { status: 423 });
    }

    const { data: row } = await service
      .schema("hotel")
      .from("memberships")
      .select("pin_hash, pin_failed_count")
      .eq("tenant_id", tenant.id)
      .eq("user_id", target.userId)
      .maybeSingle();
    const who = { userId: target.userId, name: target.name, department: target.department };
    const device = (req.headers.get("user-agent") ?? "").slice(0, 120) || null;

    if (!verifyPin(body.pin, (row?.pin_hash as string | null) ?? null)) {
      const failed = ((row?.pin_failed_count as number | null) ?? 0) + 1;
      const lock = failed >= MAX_PIN_ATTEMPTS;
      await service
        .schema("hotel")
        .from("memberships")
        .update({ pin_failed_count: failed, pin_locked_at: lock ? new Date().toISOString() : null })
        .eq("tenant_id", tenant.id)
        .eq("user_id", target.userId);
      await recordAudit(service, { tenantId: tenant.id, action: lock ? "pin_locked" : "pin_failed", entityType: "pin", entityId: target.userId, actor: who, device });
      return NextResponse.json(
        {
          error: lock
            ? `Too many wrong PINs. ${target.name}'s PIN is locked until the head of department clears it.`
            : `That PIN isn't right. ${MAX_PIN_ATTEMPTS - failed} ${MAX_PIN_ATTEMPTS - failed === 1 ? "try" : "tries"} left.`,
        },
        { status: lock ? 423 : 401 },
      );
    }

    await service
      .schema("hotel")
      .from("memberships")
      .update({ pin_failed_count: 0, pin_locked_at: null })
      .eq("tenant_id", tenant.id)
      .eq("user_id", target.userId);
    await setActiveState(tenant.id, user.id, { userId: target.userId, name: target.name });
    await recordAudit(service, { tenantId: tenant.id, action: "pin_switch", entityType: "session", entityId: target.userId, actor: who, device });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0]?.message || "Invalid input." }, { status: 400 });
    }
    return NextResponse.json({ error: "Unable to switch." }, { status: 500 });
  }
}

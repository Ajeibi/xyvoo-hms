import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/supabase/auth-server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getHotelTenantBySlug } from "@/lib/hms/data";
import { setActiveState } from "@/lib/hms/active-person";
import { listSwitchablePeople } from "@/lib/hms/session-switch";

const Schema = z.object({ slug: z.string().min(1) });

/** Locks this screen: nothing works until someone enters their PIN. Never locks a screen nobody could open again. */
export async function POST(req: Request) {
  try {
    const { slug } = Schema.parse(await req.json());
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const tenant = await getHotelTenantBySlug(slug);
    if (!tenant) return NextResponse.json({ error: "Tenant not found." }, { status: 404 });

    const people = await listSwitchablePeople(createServerSupabaseClient(), tenant.id, user.id);
    if (people.length === 0) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    if (!people.some((p) => p.hasPin && !p.pinLocked)) {
      return NextResponse.json({ error: "Set a PIN first (account menu, My PIN), so you can unlock the screen again." }, { status: 400 });
    }
    await setActiveState(tenant.id, user.id, null);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Unable to lock." }, { status: 500 });
  }
}

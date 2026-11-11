import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHotelApiMember, requireHotelApiSection } from "@/lib/hms/hotel-api-auth";
import { acceptGroupInvite, removeHotelFromGroup } from "@/lib/hms/groups/group-admin";
import { setGuestGroupOptOut } from "@/lib/hms/groups/group-guests";
import { createSupabaseAuthServerClient, getSessionUser } from "@/lib/supabase/auth-server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

/*
 * The hotel's side of being in a group:
 *  - accept: the hotel's owner accepts an invitation (the database checks they own the hotel);
 *  - leave: the hotel's owner takes the hotel out of its group;
 *  - guest-optout: staff who use guest profiles keep one guest out of the group, or let them back in.
 */

const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("accept"), token: z.string().min(10).max(200) }),
  z.object({ action: z.literal("leave"), slug: z.string().min(1) }),
  z.object({ action: z.literal("guest-optout"), slug: z.string().min(1), guestId: z.string().uuid(), optOut: z.boolean() }),
]);

export async function POST(req: Request) {
  let body: z.infer<typeof Body>;
  try {
    body = Body.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Check what you sent." }, { status: 400 });
  }

  try {
    if (body.action === "accept") {
      const user = await getSessionUser();
      if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
      const userDb = await createSupabaseAuthServerClient();
      const groupId = await acceptGroupInvite(userDb, body.token);
      const { data: group } = await createServerSupabaseClient().schema("hotel").from("hotel_groups").select("slug").eq("id", groupId).maybeSingle();
      return NextResponse.json({ ok: true, groupSlug: group?.slug ?? null });
    }

    if (body.action === "leave") {
      const auth = await requireHotelApiMember(body.slug);
      if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
      if (auth.role !== "owner") return NextResponse.json({ error: "Only the hotel's owner can take it out of its group." }, { status: 403 });
      const userDb = await createSupabaseAuthServerClient();
      await removeHotelFromGroup(userDb, auth.tenant.id);
      return NextResponse.json({ ok: true });
    }

    const auth = await requireHotelApiSection(body.slug, ["guests", "frontdesk", "reservations"]);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const { data: guest } = await auth.service.schema("hotel").from("guests").select("id").eq("id", body.guestId).eq("tenant_id", auth.tenant.id).maybeSingle();
    if (!guest) return NextResponse.json({ error: "Guest not found." }, { status: 404 });
    await setGuestGroupOptOut(auth.service, auth.tenant.id, body.guestId, body.optOut, auth.user.id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Something went wrong." }, { status: 400 });
  }
}

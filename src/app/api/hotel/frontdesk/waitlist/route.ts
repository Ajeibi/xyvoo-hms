import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHotelApiMember } from "@/lib/hms/hotel-api-auth";
import { writeAuditLog } from "@/lib/hms/front-desk-ops";
import { getRequestsIncidentsCapabilities } from "@/lib/hms/requests-incidents-rbac";
import { WAITLIST_STATUSES, listWaitlistEntries } from "@/lib/hms/waitlist";
import { normalizeRoomTypes } from "@/lib/hms/room-pricing";

const ListQuery = z.object({
  slug: z.string().min(1),
  q: z.string().optional(),
  status: z.enum(WAITLIST_STATUSES).optional(),
});

const PostBody = z.object({
  slug: z.string().min(1),
  guestName: z.string().min(1).max(160),
  phone: z.string().max(40).optional(),
  email: z.string().email().max(120).optional().or(z.literal("")),
  desiredRoomTypeCode: z.string().max(40).optional(),
  desiredArrivalDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  desiredDepartureDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  partySize: z.coerce.number().int().min(1).max(20).default(1),
  notes: z.string().max(1000).optional(),
});

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const query = ListQuery.parse({
      slug: url.searchParams.get("slug"),
      q: url.searchParams.get("q") ?? undefined,
      status: url.searchParams.get("status") ?? undefined,
    });

    const auth = await requireHotelApiMember(query.slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const caps = getRequestsIncidentsCapabilities({ membershipRole: auth.role, departmentRole: auth.departmentRole });
    const roomTypes = normalizeRoomTypes(auth.tenant.room_types);
    const roomTypeNameByCode = new Map(roomTypes.map((t) => [t.id, t.name]));

    const payload = await listWaitlistEntries(
      auth.service,
      auth.tenant.id,
      { q: query.q, status: query.status },
      roomTypeNameByCode,
    );

    return NextResponse.json({ ...payload, capabilities: caps });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.issues[0]?.message }, { status: 400 });
    }
    console.error("[waitlist GET]", e);
    return NextResponse.json({ error: "Failed to load waitlist." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = PostBody.parse(await req.json());
    const auth = await requireHotelApiMember(body.slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const caps = getRequestsIncidentsCapabilities({ membershipRole: auth.role, departmentRole: auth.departmentRole });
    if (!caps.canManageWaitlist) return NextResponse.json({ error: "Not allowed." }, { status: 403 });

    if (new Date(body.desiredDepartureDate) <= new Date(body.desiredArrivalDate)) {
      return NextResponse.json({ error: "Departure must be after arrival." }, { status: 400 });
    }

    const { data: row, error } = await auth.service
      .schema("hotel")
      .from("waitlist_entries")
      .insert({
        tenant_id: auth.tenant.id,
        guest_name: body.guestName.trim(),
        phone: body.phone?.trim() || null,
        email: body.email?.trim() || null,
        desired_room_type_code: body.desiredRoomTypeCode || null,
        desired_arrival_date: body.desiredArrivalDate,
        desired_departure_date: body.desiredDepartureDate,
        party_size: body.partySize,
        status: "waiting",
        notes: body.notes?.trim() || null,
        created_by: auth.user.id,
      })
      .select("id")
      .single();

    if (error || !row) {
      console.error("[waitlist POST]", error);
      return NextResponse.json({ error: "Could not add to waitlist." }, { status: 500 });
    }

    await writeAuditLog({
      tenantId: auth.tenant.id,
      actorUserId: auth.user.id,
      action: "waitlist_entry_created",
      entityType: "waitlist_entry",
      entityId: row.id as string,
      after: { guestName: body.guestName, desiredArrivalDate: body.desiredArrivalDate },
    });

    return NextResponse.json({ ok: true, id: row.id });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.issues[0]?.message }, { status: 400 });
    }
    console.error("[waitlist POST]", e);
    return NextResponse.json({ error: "Failed to add to waitlist." }, { status: 500 });
  }
}

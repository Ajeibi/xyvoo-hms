import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHotelApiSection } from "@/lib/hms/hotel-api-auth";
import { writeAuditLog, emitNotification } from "@/lib/hms/front-desk-ops";
import { getArrivalsCapabilities } from "@/lib/hms/arrivals-rbac";
import { appendGuestRequestEvent } from "@/lib/hms/guest-services";
import {
  planWelcomeTasks,
  welcomeTaskDueIso,
  WELCOME_NOTE_DEPARTMENT_LABELS,
  WELCOME_NOTE_DEPARTMENTS,
  WELCOME_NOTE_ITEM_KEYS,
} from "@/lib/hms/welcome-notes";

const PostSchema = z
  .object({
    slug: z.string().min(1),
    items: z.array(z.enum(WELCOME_NOTE_ITEM_KEYS)).max(10).default([]),
    custom: z
      .object({ label: z.string().trim().min(1).max(80), department: z.enum(WELCOME_NOTE_DEPARTMENTS) })
      .optional(),
    note: z.string().trim().max(500).optional(),
  })
  .refine((b) => b.items.length > 0 || b.custom != null, {
    message: "Choose at least one item to send.",
  });

const OPEN_RESERVATION_STATUSES = ["confirmed", "checked_in"];

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const slug = new URL(req.url).searchParams.get("slug");
    if (!slug) return NextResponse.json({ error: "slug required" }, { status: 400 });

    const auth = await requireHotelApiSection(slug, ["frontdesk", "reservations"]);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const { data: notes, error } = await auth.service
      .schema("hotel")
      .from("reservation_welcome_notes")
      .select("id,note,created_at")
      .eq("tenant_id", auth.tenant.id)
      .eq("reservation_id", id)
      .order("created_at", { ascending: false });

    if (error) {
      if (error.code === "42P01") return NextResponse.json({ notes: [] });
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const noteIds = (notes ?? []).map((n) => n.id as string);
    const { data: tasks } =
      noteIds.length > 0
        ? await auth.service
            .schema("hotel")
            .from("guest_requests")
            .select("id,welcome_note_id,request_type,department,status")
            .eq("tenant_id", auth.tenant.id)
            .in("welcome_note_id", noteIds)
            .order("created_at", { ascending: true })
        : { data: [] };

    return NextResponse.json({
      notes: (notes ?? []).map((n) => ({
        id: n.id as string,
        note: (n.note as string | null) ?? null,
        createdAt: n.created_at as string,
        tasks: (tasks ?? [])
          .filter((t) => t.welcome_note_id === n.id)
          .map((t) => ({
            id: t.id as string,
            requestType: t.request_type as string,
            department: t.department as string,
            status: t.status as string,
          })),
      })),
    });
  } catch {
    return NextResponse.json({ error: "Failed to load welcome notes." }, { status: 500 });
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = PostSchema.parse(await req.json());
    const auth = await requireHotelApiSection(body.slug, ["frontdesk", "reservations"]);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const caps = getArrivalsCapabilities(auth.departmentRole ?? auth.role);
    if (!caps.canManageRequests) return NextResponse.json({ error: "Not allowed." }, { status: 403 });

    const { data: resRow } = await auth.service
      .schema("hotel")
      .from("reservations")
      .select("id,status,room_unit_id,vip_flag,arrival_at")
      .eq("tenant_id", auth.tenant.id)
      .eq("id", id)
      .maybeSingle();

    if (!resRow) return NextResponse.json({ error: "Booking not found." }, { status: 404 });
    if (!OPEN_RESERVATION_STATUSES.includes(resRow.status as string)) {
      return NextResponse.json(
        { error: "A welcome note can only be added to a booking that is still coming or in the house." },
        { status: 409 },
      );
    }

    const specs = planWelcomeTasks({ itemKeys: body.items, custom: body.custom, note: body.note });

    // Skip anything already waiting on a department, so a second click can't send it twice.
    const { data: openTasks } = await auth.service
      .schema("hotel")
      .from("guest_requests")
      .select("request_type")
      .eq("tenant_id", auth.tenant.id)
      .eq("reservation_id", id)
      .not("welcome_note_id", "is", null)
      .not("status", "in", "(completed,cancelled)");
    const alreadyOpen = new Set((openTasks ?? []).map((t) => (t.request_type as string).toLowerCase()));
    const fresh = specs.filter((s) => !alreadyOpen.has(s.requestType.toLowerCase()));
    if (fresh.length === 0) {
      return NextResponse.json(
        { error: "Those items have already been sent and are still being done." },
        { status: 409 },
      );
    }

    const { data: noteRow, error: noteErr } = await auth.service
      .schema("hotel")
      .from("reservation_welcome_notes")
      .insert({
        tenant_id: auth.tenant.id,
        reservation_id: id,
        note: body.note || null,
        items: fresh.map((s) => s.requestType),
        created_by: auth.user.id,
      })
      .select("id")
      .single();

    if (noteErr || !noteRow) {
      if (noteErr?.code === "42P01") {
        return NextResponse.json(
          { error: "Welcome notes are not set up yet. Apply the welcome_notes migration." },
          { status: 503 },
        );
      }
      return NextResponse.json({ error: noteErr?.message ?? "Could not save the note." }, { status: 500 });
    }

    const nowIso = new Date().toISOString();
    const { data: created, error: taskErr } = await auth.service
      .schema("hotel")
      .from("guest_requests")
      .insert(
        fresh.map((s) => ({
          tenant_id: auth.tenant.id,
          reservation_id: id,
          room_unit_id: resRow.room_unit_id ?? null,
          request_type: s.requestType,
          service_category: s.department,
          details: s.details,
          department: s.department,
          status: "assigned",
          priority: resRow.vip_flag ? "vip" : "normal",
          is_vip_snapshot: Boolean(resRow.vip_flag),
          expected_completed_at: welcomeTaskDueIso(resRow.arrival_at as string | null, s.department),
          assigned_at: nowIso,
          created_by: auth.user.id,
          welcome_note_id: noteRow.id,
        })),
      )
      .select("id,request_type,department");

    if (taskErr || !created) {
      await auth.service.schema("hotel").from("reservation_welcome_notes").delete().eq("id", noteRow.id);
      return NextResponse.json({ error: taskErr?.message ?? "Could not send the tasks." }, { status: 500 });
    }

    for (const task of created) {
      await appendGuestRequestEvent(auth.service, {
        tenantId: auth.tenant.id,
        guestRequestId: task.id as string,
        action: "created",
        payload: { source: "welcome_note", welcomeNoteId: noteRow.id, requestType: task.request_type },
        actorUserId: auth.user.id,
      });
    }

    await writeAuditLog({
      tenantId: auth.tenant.id,
      actorUserId: auth.user.id,
      action: "welcome_note_added",
      entityType: "reservation",
      entityId: id,
      after: { welcome_note_id: noteRow.id, items: fresh.map((s) => s.requestType), note: body.note ?? null },
    });

    const departments = [...new Set(fresh.map((s) => s.department))];
    for (const dept of departments) {
      const mine = fresh.filter((s) => s.department === dept).map((s) => s.requestType.replace(/^Welcome: /, ""));
      await emitNotification({
        tenantId: auth.tenant.id,
        type: "guest_service_request",
        title: resRow.vip_flag ? "VIP welcome set-up" : "Welcome set-up for an arrival",
        body: `${mine.join(", ")} for ${WELCOME_NOTE_DEPARTMENT_LABELS[dept].toLowerCase()}`,
        severity: resRow.vip_flag ? "warning" : "info",
        entityType: "reservation",
        entityId: id,
        department: dept,
      });
    }

    return NextResponse.json({ ok: true, id: noteRow.id, sent: fresh.length, skipped: specs.length - fresh.length });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.issues[0]?.message }, { status: 400 });
    }
    console.error("[welcome-note POST]", e);
    return NextResponse.json({ error: "Failed to add the welcome note." }, { status: 500 });
  }
}

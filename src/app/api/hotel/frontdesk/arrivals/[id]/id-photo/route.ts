import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHotelApiSection } from "@/lib/hms/hotel-api-auth";
import { writeAuditLog } from "@/lib/hms/front-desk-ops";
import { getArrivalsCapabilities } from "@/lib/hms/arrivals-rbac";
import type { HmsSectionKey } from "@/lib/hms/department-access";
import {
  checkIdPhoto,
  deleteIdPhoto,
  ID_PHOTO_SIDES,
  listIdPhotos,
  MAX_ID_PHOTOS_PER_BOOKING,
  saveIdPhoto,
} from "@/lib/hms/id-photos";

const SECTIONS: HmsSectionKey[] = ["frontdesk", "reservations"];
const OPEN_STATUSES = ["confirmed", "checked_in"];

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const slug = new URL(req.url).searchParams.get("slug");
    if (!slug) return NextResponse.json({ error: "slug required" }, { status: 400 });
    const auth = await requireHotelApiSection(slug, SECTIONS);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const caps = getArrivalsCapabilities(auth.departmentRole ?? auth.role);
    if (!caps.canManageRequests) return NextResponse.json({ error: "Not allowed." }, { status: 403 });

    const photos = await listIdPhotos(auth.service, auth.tenant.id, id);
    return NextResponse.json({ photos }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Failed to load ID photos." }, { status: 500 });
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const form = await req.formData();
    const slug = String(form.get("slug") ?? "");
    const side = z.enum(ID_PHOTO_SIDES).safeParse(form.get("side") ?? "front");
    const file = form.get("photo");
    if (!slug) return NextResponse.json({ error: "slug required" }, { status: 400 });
    if (!side.success) return NextResponse.json({ error: "Choose front or back." }, { status: 400 });
    if (!(file instanceof File)) return NextResponse.json({ error: "Take or choose a photo first." }, { status: 400 });

    const auth = await requireHotelApiSection(slug, SECTIONS);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const caps = getArrivalsCapabilities(auth.departmentRole ?? auth.role);
    if (!caps.canManageRequests) return NextResponse.json({ error: "Not allowed." }, { status: 403 });

    const { data: resRow } = await auth.service
      .schema("hotel")
      .from("reservations")
      .select("id,status,reservation_guests(is_primary,guest_id)")
      .eq("tenant_id", auth.tenant.id)
      .eq("id", id)
      .maybeSingle();
    if (!resRow) return NextResponse.json({ error: "Booking not found." }, { status: 404 });
    if (!OPEN_STATUSES.includes(resRow.status as string)) {
      return NextResponse.json(
        { error: "An ID photo can only be added to a booking that is still coming or in the house." },
        { status: 409 },
      );
    }

    const existing = await listIdPhotos(auth.service, auth.tenant.id, id);
    if (existing.length >= MAX_ID_PHOTOS_PER_BOOKING) {
      return NextResponse.json({ error: "This booking already has the most photos it can keep. Remove one first." }, { status: 409 });
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    const checked = checkIdPhoto(bytes);
    if ("error" in checked) return NextResponse.json({ error: checked.error }, { status: 400 });

    const links = (resRow.reservation_guests ?? []) as { is_primary: boolean | null; guest_id: string | null }[];
    const primary = links.find((l) => l.is_primary) ?? links[0];

    const saved = await saveIdPhoto(auth.service, {
      tenantId: auth.tenant.id,
      reservationId: id,
      guestId: primary?.guest_id ?? null,
      side: side.data,
      bytes,
      type: checked.type,
      userId: auth.user.id,
    });
    if ("error" in saved) return NextResponse.json({ error: saved.error }, { status: 500 });

    await writeAuditLog({
      tenantId: auth.tenant.id,
      actorUserId: auth.user.id,
      action: "id_photo_added",
      entityType: "reservation",
      entityId: id,
      after: { photo_id: saved.id, side: side.data },
    });
    return NextResponse.json({ ok: true, id: saved.id });
  } catch (e) {
    console.error("[id-photo POST]", e);
    return NextResponse.json({ error: "Failed to save the ID photo." }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const url = new URL(req.url);
    const slug = url.searchParams.get("slug");
    const photoId = url.searchParams.get("photoId");
    if (!slug || !photoId) return NextResponse.json({ error: "slug and photoId required" }, { status: 400 });
    const auth = await requireHotelApiSection(slug, SECTIONS);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const caps = getArrivalsCapabilities(auth.departmentRole ?? auth.role);
    if (!caps.canManageRequests) return NextResponse.json({ error: "Not allowed." }, { status: 403 });

    const removed = await deleteIdPhoto(auth.service, auth.tenant.id, id, photoId);
    if (!removed) return NextResponse.json({ error: "Photo not found." }, { status: 404 });
    await writeAuditLog({
      tenantId: auth.tenant.id,
      actorUserId: auth.user.id,
      action: "id_photo_removed",
      entityType: "reservation",
      entityId: id,
      before: { photo_id: photoId },
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[id-photo DELETE]", e);
    return NextResponse.json({ error: "Failed to remove the photo." }, { status: 500 });
  }
}

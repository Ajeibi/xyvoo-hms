import { NextResponse } from "next/server";
import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { checkIdPhoto, ID_PHOTO_SIDES, listIdPhotos, MAX_ID_PHOTOS_PER_BOOKING, saveIdPhoto } from "@/lib/hms/id-photos";
import { loadGuestStayView, verifyCheckInToken } from "@/lib/hms/online-checkin";

/** The guest adds a photo of their ID from their phone. Limited to the stay named by the link. */

const NO_STORE = { "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex" };

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const link = verifyCheckInToken(token);
    if (!link) return NextResponse.json({ error: "This link has expired or isn't right." }, { status: 404, headers: NO_STORE });

    const form = await req.formData();
    const side = z.enum(ID_PHOTO_SIDES).safeParse(form.get("side") ?? "front");
    const file = form.get("photo");
    if (!side.success) return NextResponse.json({ error: "Choose front or back." }, { status: 400, headers: NO_STORE });
    if (!(file instanceof File)) return NextResponse.json({ error: "Take or choose a photo first." }, { status: 400, headers: NO_STORE });

    const db = createServerSupabaseClient();
    const stay = await loadGuestStayView(db, link.tenantId, link.reservationId);
    if (!stay || stay.status !== "confirmed") {
      return NextResponse.json({ error: "This booking can no longer be checked in online." }, { status: 409, headers: NO_STORE });
    }
    const existing = await listIdPhotos(db, link.tenantId, link.reservationId);
    if (existing.length >= MAX_ID_PHOTOS_PER_BOOKING) {
      return NextResponse.json({ error: "You have added the most photos allowed." }, { status: 409, headers: NO_STORE });
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    const checked = checkIdPhoto(bytes);
    if ("error" in checked) return NextResponse.json({ error: checked.error }, { status: 400, headers: NO_STORE });

    const saved = await saveIdPhoto(db, {
      tenantId: link.tenantId,
      reservationId: link.reservationId,
      guestId: stay.guest.id,
      side: side.data,
      bytes,
      type: checked.type,
      userId: null,
    });
    if ("error" in saved) return NextResponse.json({ error: saved.error }, { status: 500, headers: NO_STORE });
    return NextResponse.json({ ok: true, photos: existing.length + 1 }, { headers: NO_STORE });
  } catch (e) {
    console.error("[online check-in id photo]", e);
    return NextResponse.json({ error: "Could not add the photo." }, { status: 500, headers: NO_STORE });
  }
}

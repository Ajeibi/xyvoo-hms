import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHotelApiMember } from "@/lib/hms/hotel-api-auth";
import { getArrivalsCapabilities } from "@/lib/hms/arrivals-rbac";
import { addGuestNote, listGuestNotes } from "@/lib/hms/guest-management";

const QuerySchema = z.object({ slug: z.string().min(1) });
const PostBodySchema = z.object({ slug: z.string().min(1), note: z.string().min(1).max(2000) });

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const url = new URL(req.url);
    const query = QuerySchema.parse({ slug: url.searchParams.get("slug") });
    const auth = await requireHotelApiMember(query.slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const notes = await listGuestNotes(auth.service, auth.tenant.id, id);
    return NextResponse.json({ notes });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.issues[0]?.message ?? "Invalid request." }, { status: 400 });
    }
    return NextResponse.json({ error: "Could not load guest notes." }, { status: 500 });
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = PostBodySchema.parse(await req.json());
    const auth = await requireHotelApiMember(body.slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const capabilities = getArrivalsCapabilities(auth.role);
    if (!capabilities.canEditNotes) return NextResponse.json({ error: "Not allowed." }, { status: 403 });

    const result = await addGuestNote(auth.service, {
      tenantId: auth.tenant.id,
      guestId: id,
      note: body.note,
      authorUserId: auth.user.id,
    });

    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
    const notes = await listGuestNotes(auth.service, auth.tenant.id, id);
    return NextResponse.json({ ok: true, notes });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.issues[0]?.message ?? "Invalid request." }, { status: 400 });
    }
    return NextResponse.json({ error: "Could not save guest note." }, { status: 500 });
  }
}

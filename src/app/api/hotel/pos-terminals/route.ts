import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHotelApiMember } from "@/lib/hms/hotel-api-auth";
import { isAdminLikeRole } from "@/lib/hms/department-access";
import { createPosTerminal, listPosTerminals } from "@/lib/hms/pos-terminals";

/** Active card machines, for the payment forms. Any hotel member may read them. */
export async function GET(req: Request) {
  try {
    const slug = z.string().min(1).parse(new URL(req.url).searchParams.get("slug"));
    const auth = await requireHotelApiMember(slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const terminals = await listPosTerminals(auth.service, auth.tenant.id, { activeOnly: true });
    return NextResponse.json({ terminals });
  } catch {
    return NextResponse.json({ error: "Could not load the card machines." }, { status: 400 });
  }
}

const PostSchema = z.object({ slug: z.string().min(1), name: z.string().trim().min(1, "Enter a name.").max(60) });

export async function POST(req: Request) {
  try {
    const body = PostSchema.parse(await req.json());
    const auth = await requireHotelApiMember(body.slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
    if (!isAdminLikeRole(auth.role)) return NextResponse.json({ error: "Only an owner or admin can manage card machines." }, { status: 403 });
    const { row, error } = await createPosTerminal(auth.service, { tenantId: auth.tenant.id, name: body.name });
    if (!row) return NextResponse.json({ error }, { status: 400 });
    return NextResponse.json({ terminal: row });
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: e.issues[0]?.message }, { status: 400 });
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
}

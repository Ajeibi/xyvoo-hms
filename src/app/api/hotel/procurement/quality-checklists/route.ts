import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHotelApiMember } from "@/lib/hms/hotel-api-auth";
import { listQualityChecklists, upsertQualityChecklist } from "@/lib/hms/procurement-quality";

const QuerySchema = z.object({ slug: z.string().min(1) });

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const query = QuerySchema.parse({ slug: url.searchParams.get("slug") });
    const auth = await requireHotelApiMember(query.slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const checklists = await listQualityChecklists(auth.service, auth.tenant.id);
    return NextResponse.json({ checklists });
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: e.issues[0]?.message }, { status: 400 });
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
}

const PostSchema = z.object({
  slug: z.string().min(1),
  itemTypeId: z.string().min(1),
  checklistItems: z.array(z.string().min(1).max(200)).max(30),
});

export async function POST(req: Request) {
  try {
    const body = PostSchema.parse(await req.json());
    const auth = await requireHotelApiMember(body.slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const { checklist, error } = await upsertQualityChecklist(auth.service, {
      tenantId: auth.tenant.id,
      itemTypeId: body.itemTypeId,
      checklistItems: body.checklistItems,
    });
    if (error || !checklist) return NextResponse.json({ error: error ?? "Could not save checklist." }, { status: 400 });
    return NextResponse.json({ checklist });
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: e.issues[0]?.message }, { status: 400 });
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
}

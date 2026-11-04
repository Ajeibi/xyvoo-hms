import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHotelApiMember } from "@/lib/hms/hotel-api-auth";
import { getGuestsDirectory } from "@/lib/hms/guests-directory";
import { canEditGuests, requireGuestsApi } from "@/lib/hms/guest-access";
import { guestFieldsSchema } from "@/lib/hms/guest-fields";
import { createGuest } from "@/lib/hms/guest-edit";

const QuerySchema = z.object({
  slug: z.string().min(1),
  q: z.string().max(120).optional(),
  vipOnly: z.enum(["true", "false"]).optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(50).default(10),
  segment: z.string().max(80).optional(),
});

const CreateSchema = z.object({ slug: z.string().min(1), fields: guestFieldsSchema });

/** POST /api/hotel/guests: add a guest by hand. */
export async function POST(req: Request) {
  try {
    const body = CreateSchema.parse(await req.json());
    const auth = await requireGuestsApi(body.slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
    if (!canEditGuests(auth.role)) return NextResponse.json({ error: "Not allowed." }, { status: 403 });

    const result = await createGuest(auth.service, { tenantId: auth.tenant.id, actorUserId: auth.user.id, fields: body.fields });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({ ok: true, id: result.id });
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: e.issues[0]?.message ?? "Invalid request." }, { status: 400 });
    return NextResponse.json({ error: "Could not add the guest." }, { status: 500 });
  }
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const query = QuerySchema.parse({
      slug: url.searchParams.get("slug"),
      q: url.searchParams.get("q") ?? undefined,
      vipOnly: url.searchParams.get("vipOnly") ?? undefined,
      page: url.searchParams.get("page") ?? undefined,
      pageSize: url.searchParams.get("pageSize") ?? undefined,
      segment: url.searchParams.get("segment") ?? undefined,
    });
    const auth = await requireHotelApiMember(query.slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const payload = await getGuestsDirectory(auth.tenant.id, {
      search: query.q,
      vipOnly: query.vipOnly === "true",
      segment: query.segment ?? null,
      page: query.page,
      pageSize: query.pageSize,
    });

    return NextResponse.json(payload);
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.issues[0]?.message ?? "Invalid request." }, { status: 400 });
    }
    return NextResponse.json({ error: "Could not load guests." }, { status: 500 });
  }
}

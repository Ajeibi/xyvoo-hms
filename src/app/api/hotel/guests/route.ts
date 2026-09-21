import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHotelApiMember } from "@/lib/hms/hotel-api-auth";
import { getGuestsDirectory } from "@/lib/hms/guests-directory";

const QuerySchema = z.object({
  slug: z.string().min(1),
  q: z.string().max(120).optional(),
  vipOnly: z.enum(["true", "false"]).optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(50).default(5),
});

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const query = QuerySchema.parse({
      slug: url.searchParams.get("slug"),
      q: url.searchParams.get("q") ?? undefined,
      vipOnly: url.searchParams.get("vipOnly") ?? undefined,
      page: url.searchParams.get("page") ?? undefined,
      pageSize: url.searchParams.get("pageSize") ?? undefined,
    });
    const auth = await requireHotelApiMember(query.slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const payload = await getGuestsDirectory(auth.tenant.id, {
      search: query.q,
      vipOnly: query.vipOnly === "true",
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
